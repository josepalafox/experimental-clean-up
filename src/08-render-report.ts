import type { AuditSummary, EvidenceClaim, EvidenceItem, FinalResult, RepositoryProfile } from "./support/domain-types.js";

// Step 08: Renders the final human-readable and machine-readable evidence package.

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

function evidenceLink(claim: EvidenceClaim, evidence: EvidenceItem | undefined): string {
  if (!evidence) return claim.evidence_id;
  const lineAnchor =
    evidence.sourceType === "file" && claim.line_start && claim.line_end
      ? claim.line_start === claim.line_end
        ? `#L${claim.line_start}`
        : `#L${claim.line_start}-L${claim.line_end}`
      : "";
  return `[${claim.evidence_id}](${evidence.reviewUrl}${lineAnchor})`;
}

// Callout: Each written claim has one evidence ID and, for files, a direct GitHub line link.
function renderResult(result: FinalResult): string[] {
  const lines = [
    `## [${result.repository.fullName}](${result.repository.htmlUrl})`,
    "",
    `**Category:** \`${result.category}\` · **Inactive days:** ${result.inactiveDays ?? "unknown"} · **Commit:** [${result.commitSha.slice(0, 7)}](${result.repository.htmlUrl}/commit/${result.commitSha})`,
    "",
    "| Signal | State |",
    "|---|---|",
  ];
  const evidenceById = new Map(result.evidence.map((item) => [item.id, item]));
  for (const signal of result.signals) {
    lines.push(`| ${signal.signal} | \`${signal.state}\` |`);
  }
  lines.push("");
  for (const signal of result.signals) {
    lines.push(`### ${signal.signal} — ${signal.state}`, "");
    for (const claim of signal.evidence_claims) {
      lines.push(`- ${evidenceLink(claim, evidenceById.get(claim.evidence_id))}: ${claim.claim}`);
    }
    lines.push("");
  }
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
