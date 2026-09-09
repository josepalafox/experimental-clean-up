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

// Callout: This is the application entry point for both local and GitHub Actions runs.
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.githubToken, config.maxRequests);
  // Callout: Repository discovery is deterministic; the agent is not involved.
  const repositories = await client.listOwnedPublicRepositories(config.owner, config.utilityRepository);
  const profiles: RepositoryProfile[] = [];
  const errors: AuditSummary["errors"] = [];

  for (const repository of repositories) {
    // Callout: Defense in depth prevents the run from crossing the configured owner boundary.
    if (repository.owner.toLowerCase() !== config.owner.toLowerCase()) {
      throw new Error(`Owner boundary violation: ${repository.fullName}`);
    }
    try {
      // Callout: Only repositories that pass the human-inactivity gate receive deeper collection.
      const { selection, commitSha } = await selectCandidate(client, repository, config.inactivityDays);
      if (!selection.selected) continue;
      profiles.push(await buildRepositoryProfile(client, repository, selection, commitSha));
    } catch (error) {
      errors.push({ repository: repository.fullName, error: errorMessage(error) });
    }
  }

  await mkdir("reports", { recursive: true });
  // Callout: Profile mode measures scope and validates evidence without model cost.
  if (config.auditMode === "profile") {
    const report = renderProfileSummary(profiles, repositories.length);
    await writeFile("reports/latest.md", report, "utf8");
    await writeFile("reports/profiles.json", `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
    await writeJobSummary(report);
    console.log(`Profiled ${repositories.length} repositories; selected ${profiles.length} candidates.`);
    return;
  }

  const results = [];
  // Callout: This cap bounds cost and review volume for each run.
  const profilesToAssess = profiles.slice(0, config.maxAssessments);
  for (const profile of profilesToAssess) {
    try {
      const requestedSignals = unresolvedSignals(profile);
      // Callout: This is the handoff from deterministic profiling to the Cursor SDK.
      const outcome = await assessProfile(
        profile,
        config.cursorApiKey!,
        config.cursorModel,
        requestedSignals,
      );
      results.push(buildFinalResult(profile, outcome.assessment, outcome.attempts));
    } catch (error) {
      errors.push({ repository: profile.repository.fullName, error: errorMessage(error) });
    }
  }

  const summary: AuditSummary = {
    generatedAt: new Date().toISOString(),
    owner: config.owner,
    repositoriesEnumerated: repositories.length,
    candidatesSelected: profiles.length,
    candidatesAssessed: results.length,
    candidatesDeferred: Math.max(0, profiles.length - profilesToAssess.length),
    mode: config.auditMode,
    results,
    profiles: profiles.map((profile) => ({ ...profile, evidence: profile.evidence.map(({ content: _content, ...item }) => item) })),
    errors,
  };
  // Callout: The same validated result becomes human-readable and machine-readable output.
  const report = renderAuditReport(summary);
  await writeFile("reports/latest.md", report, "utf8");
  await writeFile("reports/latest.json", `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeJobSummary(report);

  // Callout: This is the only optional GitHub write, and it targets the utility repository.
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
  console.log(`Assessed ${results.length} of ${profiles.length} candidates.`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeJobSummary(report: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) await appendFile(path, report, "utf8");
}

// Callout: Execution begins here.
await main();
