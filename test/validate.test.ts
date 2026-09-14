import { describe, expect, it } from "vitest";
import { validateModelAssessment } from "../src/06-validate-assessment.js";
import type { EvidenceItem } from "../src/support/domain-types.js";

const evidence: EvidenceItem[] = [
  {
    id: "E-001",
    signal: "prompts",
    sourceType: "file",
    content: "first line\nsecond line",
    summary: "prompt",
    reviewUrl: "https://example.test/prompt",
  },
];

// Callout: These tests prove that valid evidence passes and invented evidence is rejected.
describe("validateModelAssessment", () => {
  it("accepts an exact requested signal with known evidence", () => {
    const result = validateModelAssessment(
      {
        signal_assessments: [
          {
            signal: "prompts",
            state: "weak",
            evidence_claims: [{ evidence_id: "E-001", claim: "Template text.", line_start: 1, line_end: 2 }],
          },
        ],
      },
      ["prompts"],
      evidence,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects evidence from outside the catalog", () => {
    const result = validateModelAssessment(
      {
        signal_assessments: [
          {
            signal: "prompts",
            state: "weak",
            evidence_claims: [{ evidence_id: "E-999", claim: "Template text.", line_start: 1, line_end: 1 }],
          },
        ],
      },
      ["prompts"],
      evidence,
    );
    expect(result.valid).toBe(false);
  });
});
