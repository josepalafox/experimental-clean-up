import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { selectCandidate } from "./03-select-candidates.js";
import { buildRepositoryProfile } from "./04-collect-evidence.js";
import { assessProfile } from "./05-assess-with-cursor.js";
import { unresolvedSignals } from "./06-validate-assessment.js";
import { buildFinalResult } from "./07-categorize-results.js";
import { renderAuditReport, renderProfileSummary } from "./08-render-report.js";
import { loadConfig } from "./support/config.js";
import { GitHubClient } from "./support/github-client.js";
import type { AuditSummary, RepositoryProfile } from "./support/domain-types.js";

// Step 02: Orchestrates the complete path from repository discovery to output.

// Callout: 01-audit-trigger.yml and local commands enter through main(). "profile" measures scope
// and collects evidence without model cost; "assess" continues through the full evaluation.
// Larger deployments would add rate-limit-aware batching around this same entry point.
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.githubToken, config.maxRequests);
  // Fetch the public repository pool. 03-select-candidates.ts applies the 14-day inactivity gate.
  const repositories = await client.listOwnedPublicRepositories(config.owner, config.utilityRepository);
  const publishedProfiles: RepositoryProfile[] = [];
  const results = [];
  const errors: AuditSummary["errors"] = [];
  let candidatesSelected = 0;
  let candidatesDeferred = 0;
  let assessmentsStarted = 0;

  // Callout: Process one selected repository end-to-end. File contents lose all references after each iteration;
  // only compact report metadata accumulates, rather than every repository's prefetched file bodies.
  for (const repository of repositories) {
    try {
      // Callout: Filter for 14 days of human inactivity; 03-select-candidates.ts calculates the result.
      const { selection, commitSha } = await selectCandidate(client, repository, config.inactivityDays);
      // Active repositories stop here; selected repositories continue to 04-collect-evidence.ts.
      if (!selection.selected) continue;
      const profile = await buildRepositoryProfile(client, repository, selection, commitSha);
      candidatesSelected += 1;
      // Callout: Published artifacts retain evidence metadata, never prefetched file contents.
      publishedProfiles.push(withoutFileContents(profile));

      if (config.auditMode === "profile") continue;
      if (assessmentsStarted >= config.maxAssessments) {
        candidatesDeferred += 1;
        continue;
      }

      assessmentsStarted += 1;
      // Determine which signals still need model judgment.
      const requestedSignals = unresolvedSignals(profile);
      // Callout: Receive the SDK's only accepted output as outcome; free-form agent prose never reaches this orchestrator.
      const outcome = await assessProfile(
        profile,
        config.cursorApiKey!,
        config.cursorModel,
        requestedSignals,
      );
      // Callout: 07-categorize-results.ts merges the accepted assessment with deterministic profiling into the final category.
      results.push(buildFinalResult(profile, outcome.assessment, outcome.attempts));
    } catch (error) {
      errors.push({ repository: repository.fullName, error: errorMessage(error) });
    }
  }

  await mkdir("reports", { recursive: true });
  // Callout: Profile mode measures scope and tests deterministic collection without model cost; 08-render-report.ts writes its output.
  if (config.auditMode === "profile") {
    const report = renderProfileSummary(publishedProfiles, repositories.length);
    await writeFile("reports/latest.md", report, "utf8");
    await writeFile("reports/profiles.json", `${JSON.stringify(publishedProfiles, null, 2)}\n`, "utf8");
    await writeJobSummary(report);
    console.log(`Profiled ${repositories.length} repositories; selected ${candidatesSelected} candidates.`);
    return;
  }

  const summary: AuditSummary = {
    generatedAt: new Date().toISOString(),
    owner: config.owner,
    repositoriesEnumerated: repositories.length,
    candidatesSelected,
    candidatesAssessed: results.length,
    candidatesDeferred,
    mode: config.auditMode,
    results,
    profiles: publishedProfiles,
    errors,
  };
  // Callout: 08-render-report.ts turns the validated result into human-readable and machine-readable output.
  const report = renderAuditReport(summary);
  await writeFile("reports/latest.md", report, "utf8");
  await writeFile("reports/latest.json", `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeJobSummary(report);

  // Callout: This is the only optional GitHub write; support/github-client.ts targets the utility repository.
  if (config.createTrackingIssue) {
    if (!config.githubToken) throw new Error("GITHUB_TOKEN is required to create the tracking issue");
    const url = await client.upsertTrackingIssue(
      config.owner,
      config.utilityRepository,
      "Experimental cleanup review",
      report,
      config.githubToken,
    );
    console.log(`Tracking issue: ${url}`);
  }
  console.log(`Assessed ${results.length} of ${candidatesSelected} candidates.`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withoutFileContents(profile: RepositoryProfile): RepositoryProfile {
  return {
    ...profile,
    evidence: profile.evidence.map(({ content: _content, ...item }) => item),
  };
}

async function writeJobSummary(report: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) await appendFile(path, report, "utf8");
}

// Callout: Execution begins here.
await main();
