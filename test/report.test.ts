import { describe, expect, it } from "vitest";
import { renderAuditReport } from "../src/08-render-report.js";
import type { AuditSummary } from "../src/support/domain-types.js";

// Callout: This test protects the direct file-line links that make each claim reviewable.
describe("renderAuditReport", () => {
  it("renders a file claim with a GitHub line-range link", () => {
    const summary: AuditSummary = {
      generatedAt: "2026-09-14T00:00:00Z",
      owner: "josepalafox",
      repositoriesEnumerated: 1,
      candidatesSelected: 1,
      candidatesAssessed: 1,
      candidatesDeferred: 0,
      mode: "assess",
      profiles: [],
      errors: [],
      results: [
        {
          repository: {
            id: 1,
            owner: "josepalafox",
            name: "example",
            fullName: "josepalafox/example",
            htmlUrl: "https://github.com/josepalafox/example",
            defaultBranch: "main",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            archived: false,
            fork: false,
            visibility: "public",
          },
          commitSha: "abc123456789",
          collectedAt: "2026-09-14T00:00:00Z",
          inactiveDays: 30,
          lastHumanActivity: null,
          weakOrAbsentCount: 2,
          category: "further_investigation",
          reasonCodes: [],
          validationStatus: "valid",
          assessmentAttempts: 1,
          signals: [
            {
              signal: "onboarding",
              state: "substantive",
              evidence_claims: [{ evidence_id: "E-010", claim: "README documents installation.", line_start: 42, line_end: 58 }],
              decided_by: "model",
            },
          ],
          evidence: [
            {
              id: "E-010",
              signal: "onboarding",
              sourceType: "file",
              path: "README.md",
              summary: "README.md",
              reviewUrl: "https://github.com/josepalafox/example/blob/abc123456789/README.md",
            },
          ],
        },
      ],
    };

    expect(renderAuditReport(summary)).toContain(
      "[E-010](https://github.com/josepalafox/example/blob/abc123456789/README.md#L42-L58): README documents installation.",
    );
  });
});
