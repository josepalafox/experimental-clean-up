import type { AuditSummary, FinalResult, RepositoryProfile } from "./types.js";

// Callout: Profile output makes the candidate population visible before model assessment.
export function renderProfileSummary(profiles: RepositoryProfile[], enumerated: number): string {
  const lines = [
    "# Experimental cleanup profile",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Repositories enumerated: ${enumerated}`,
    `Candidates selected: ${profiles.length}`,
    "",
    "| Repository | Inactive days | Last human activity |",
    "|---|---:|---|",
  ];
  for (const profile of profiles) {
    const activity = profile.candidateSelection.lastHumanActivity;
    lines.push(
      `| [${profile.repository.fullName}](${profile.repository.htmlUrl}) | ${profile.candidateSelection.inactiveDays ?? "unknown"} | ${activity ? `${activity.type} on ${activity.occurredAt.slice(0, 10)}` : "unknown"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

// Callout: Every surfaced judgment links back to the exact evidence a reviewer can inspect.
function renderResult(result: FinalResult): string[] {
  const lines = [
    `## [${result.repository.fullName}](${result.repository.htmlUrl})`,
    "",
    `**Category:** \`${result.category}\` · **Inactive days:** ${result.inactiveDays ?? "unknown"} · **Commit:** [${result.commitSha.slice(0, 7)}](${result.repository.htmlUrl}/commit/${result.commitSha})`,
    "",
    "| Signal | State | Evidence |",
    "|---|---|---|",
  ];
  const evidenceById = new Map(result.evidence.map((item) => [item.id, item]));
  for (const signal of result.signals) {
    const links = signal.evidence_ids
      .map((id) => {
        const item = evidenceById.get(id);
        return item ? `[${id}](${item.reviewUrl})` : id;
      })
      .join(", ");
    lines.push(`| ${signal.signal} | \`${signal.state}\` | ${links} |`);
  }
  lines.push("", ...result.signals.map((signal) => `- **${signal.signal}:** ${signal.explanation}`), "");
  return lines;
}

// Callout: The report explicitly presents candidates for review, never deletion decisions.
export function renderAuditReport(summary: AuditSummary): string {
  const surfaced = summary.results.filter((result) => result.category !== "not_surfaced");
  const lines = [
    "# Experimental cleanup review",
    "",
    `Generated: ${summary.generatedAt}`,
    `Repositories enumerated: ${summary.repositoriesEnumerated}`,
    `Candidates selected: ${summary.candidatesSelected}`,
    `Candidates assessed: ${summary.candidatesAssessed}`,
    `Candidates deferred: ${summary.candidatesDeferred}`,
    "",
    "> These are review candidates, not deletion decisions. Confirm ownership and operational use before changing a repository.",
    "",
  ];
  if (surfaced.length === 0) {
    lines.push("No repositories were surfaced in this run.", "");
  } else {
    for (const result of surfaced) lines.push(...renderResult(result));
  }
  if (summary.errors.length > 0) {
    lines.push("## Collection or assessment errors", "");
    for (const error of summary.errors) lines.push(`- **${error.repository}:** ${error.error}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
