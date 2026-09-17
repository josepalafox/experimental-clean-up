import { describe, expect, it } from "vitest";
import {
  MAX_EXCERPT_CHARS_PER_ITEM,
  MAX_INITIAL_EXCERPT_CHARS,
  buildAssessmentPrompt,
  selectOnboardingPassages,
} from "../src/support/assessment-prompt.js";
import type { RepositoryProfile } from "../src/support/domain-types.js";

function profileWithEvidence(content: string): RepositoryProfile {
  return {
    repository: {
      id: 1,
      owner: "octo",
      name: "example",
      fullName: "octo/example",
      htmlUrl: "https://github.com/octo/example",
      defaultBranch: "main",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      archived: false,
      fork: false,
      visibility: "public",
    },
    commitSha: "abc123",
    collectedAt: "2026-01-01T00:00:00Z",
    candidateSelection: {
      thresholdDays: 14,
      primaryContributor: "octo",
      lastHumanActivity: null,
      inactiveDays: 30,
      selected: true,
      unavailableSources: [],
    },
    signalInventory: [
      {
        signal: "ci",
        searchStatus: "complete",
        matchedPaths: [".github/workflows/test.yml"],
        deterministicState: null,
        evidenceIds: ["E-001"],
      },
    ],
    evidence: [
      {
        id: "E-001",
        signal: "ci",
        sourceType: "file",
        path: ".github/workflows/test.yml",
        content,
        summary: "CI workflow",
        reviewUrl: "https://github.com/octo/example/blob/abc123/.github/workflows/test.yml",
      },
    ],
    requestCount: 1,
  };
}

describe("selectOnboardingPassages", () => {
  it("keeps original line numbers for install sections deep in a README", () => {
    const lines = Array.from({ length: 530 }, (_, index) => {
      if (index === 0) return "# Axios";
      if (index === 525) return "## Installing";
      if (index === 526) return "```bash";
      if (index === 527) return "npm install axios";
      if (index === 528) return "```";
      if (index === 529) return "## API";
      return "badge";
    });
    const selected = selectOnboardingPassages(lines.join("\n"));
    expect(selected).toContain("526 | ## Installing");
    expect(selected).toContain("528 | npm install axios");
    expect(selected).not.toContain("1 | # Axios");
    expect(selected).not.toContain("## API");
  });

  it("inlines the full file when no install headings exist", () => {
    const selected = selectOnboardingPassages("# Tiny\n\nHello.\n");
    expect(selected).toContain("1 | # Tiny");
    expect(selected).toContain("3 | Hello.");
  });

  it("sends a bounded excerpt rather than full evidence content in the initial prompt", () => {
    const profile = profileWithEvidence("x".repeat(MAX_EXCERPT_CHARS_PER_ITEM * 2));
    const prompt = buildAssessmentPrompt(profile, ["ci"]);
    const manifest = JSON.parse(prompt.split("Evidence manifest:\n")[1] ?? "{}");
    const item = manifest[0] as { content_available: boolean; excerpt?: string; content?: string };

    expect(item.content_available).toBe(true);
    expect(item.content).toBeUndefined();
    expect(item.excerpt).toContain("xxx");
    expect(item.excerpt).toContain("excerpt truncated");
    expect(item.excerpt!.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS_PER_ITEM + 80);
    expect(prompt.length).toBeLessThan(MAX_INITIAL_EXCERPT_CHARS + 5_000);
  });
});
