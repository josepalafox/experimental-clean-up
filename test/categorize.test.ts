import { describe, expect, it } from "vitest";
import { buildFinalResult, categoryForSignals } from "../src/categorize.js";
import type { FinalSignal, SignalState } from "../src/types.js";
import { SIGNALS } from "../src/types.js";

function signals(states: SignalState[]): FinalSignal[] {
  return SIGNALS.map((signal, index) => ({
    signal,
    state: states[index]!,
    evidence_ids: [`E-${String(index + 1).padStart(3, "0")}`],
    explanation: "test",
    decided_by: "model",
  }));
}

// Callout: These tests lock the deterministic policy thresholds and safe uncertainty behavior.
describe("categoryForSignals", () => {
  it("surfaces four weak or absent signals for retirement review", () => {
    expect(categoryForSignals(signals(["weak", "absent", "weak", "absent", "substantive"])).category)
      .toBe("review_for_retirement");
  });

  it("routes unclear evidence to further investigation", () => {
    expect(categoryForSignals(signals(["substantive", "substantive", "unclear", "substantive", "substantive"])).category)
      .toBe("further_investigation");
  });

  it("does not surface repositories with at most one weak signal", () => {
    expect(categoryForSignals(signals(["substantive", "substantive", "weak", "substantive", "substantive"])).category)
      .toBe("not_surfaced");
  });
});

describe("buildFinalResult", () => {
  it("overrides a model result when collection was incomplete", () => {
    const result = buildFinalResult(
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
        commitSha: "abc123",
        collectedAt: "2026-01-20T00:00:00Z",
        candidateSelection: {
          thresholdDays: 14,
          primaryContributor: "josepalafox",
          lastHumanActivity: null,
          inactiveDays: 20,
          selected: true,
          unavailableSources: [],
        },
        signalInventory: SIGNALS.map((signal) => ({
          signal,
          searchStatus: signal === "ci" ? "incomplete" : "complete",
          matchedPaths: signal === "ci" ? [".github/workflows/ci.yml"] : [],
          deterministicState: signal === "ci" ? null : "absent",
          evidenceIds: [`E-${String(SIGNALS.indexOf(signal) + 1).padStart(3, "0")}`],
        })),
        evidence: [],
        requestCount: 1,
      },
      { signal_assessments: [] },
      0,
    );
    expect(result.signals.find((signal) => signal.signal === "ci")).toMatchObject({
      state: "unclear",
      decided_by: "validation_override",
    });
    expect(result.category).toBe("further_investigation");
  });
});
