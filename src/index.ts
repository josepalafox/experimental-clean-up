import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { assessProfile } from "./assess.js";
import { buildFinalResult } from "./categorize.js";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./github.js";
import { buildRepositoryProfile, selectCandidate } from "./profile.js";
import { renderAuditReport, renderProfileSummary } from "./report.js";
import type { AuditSummary, RepositoryProfile } from "./types.js";
import { unresolvedSignals } from "./validate.js";

// Callout: This is the application entry point for both local and GitHub Actions runs.
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.githubReadToken, config.maxRequests);
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
    if (!config.githubWriteToken) throw new Error("GITHUB_TOKEN is required to create the tracking issue");
    const url = await client.upsertTrackingIssue(
      config.owner,
      config.utilityRepository,
      "Experimental cleanup review",
      report,
      config.githubWriteToken,
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
