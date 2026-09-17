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

// Callout: main() coordinates the run: profile collects evidence; assess also evaluates it with the SDK.
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.githubToken, config.maxRequests);
  // support/github-client.ts lists the owner's public, non-archived, non-fork repositories.
  const repositories = await client.listOwnedPublicRepositories(config.owner, config.utilityRepository);
  const publishedProfiles: RepositoryProfile[] = [];
  const results = [];
  const errors: AuditSummary["errors"] = [];
  let candidatesSelected = 0;
  let candidatesDeferred = 0;
  let assessmentsStarted = 0;

  // Callout: Process repositories one at a time; accumulated report profiles omit file bodies.
  for (const repository of repositories) {
    try {
      // Callout: 03-select-candidates.ts applies the inactivity gate (default 14 days; unknown also passes).
      const { selection, commitSha } = await selectCandidate(client, repository, config.inactivityDays);
      if (!selection.selected) continue;
      // 04-collect-evidence.ts fetches this candidate's files before any SDK assessment.
      const profile = await buildRepositoryProfile(client, repository, selection, commitSha);
      candidatesSelected += 1;
      publishedProfiles.push(withoutFileContents(profile));

      if (config.auditMode === "profile") continue;
      // Callout: Cap candidates sent to file 05; support/config.ts defaults to 10. This is not a token cap.
      if (assessmentsStarted >= config.maxAssessments) {
        candidatesDeferred += 1;
        continue;
      }

      assessmentsStarted += 1;
      // Select completely collected signals that still need judgment.
      const requestedSignals = unresolvedSignals(profile);
      // Callout: Call 05-assess-with-cursor.ts; outcome receives its assessment and attempt count.
      const outcome = await assessProfile(
        profile,
        config.cursorApiKey!,
        config.cursorModel,
        requestedSignals,
      );
      // Callout: 07-categorize-results.ts merges all five signals and assigns the category in code.
      results.push(buildFinalResult(profile, outcome.assessment, outcome.attempts));
    } catch (error) {
      errors.push({ repository: repository.fullName, error: errorMessage(error) });
    }
  }

  await mkdir("reports", { recursive: true });
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
  // Callout: 08-render-report.ts builds Markdown; these writes publish Markdown, JSON, and the Actions summary.
  const report = renderAuditReport(summary);
  await writeFile("reports/latest.md", report, "utf8");
  await writeFile("reports/latest.json", `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeJobSummary(report);

  // Optional central issue in this utility repository; the shipped workflow lacks issues: write.
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

// Callout: await main() starts the application logic defined above.
await main();
