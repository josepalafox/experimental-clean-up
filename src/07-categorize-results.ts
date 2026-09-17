import type {
  Category,
  FinalResult,
  FinalSignal,
  ModelAssessment,
  RepositoryProfile,
} from "./support/domain-types.js";
import { SIGNALS } from "./support/domain-types.js";
import { validateFinalSignalSet } from "./06-validate-assessment.js";

// Step 07: Applies deterministic policy after all five signals are resolved.

// Callout: Fixed policy: any unclear -> investigation; otherwise 4-5 weak/absent -> retirement review,
// 2-3 -> investigation, 0-1 -> not surfaced. The model does not choose the category.
export function categoryForSignals(signals: FinalSignal[]): {
  category: Category;
  weakOrAbsentCount: number;
  reasonCodes: string[];
} {
  if (signals.some((signal) => signal.state === "unclear")) {
    return {
      category: "further_investigation",
      weakOrAbsentCount: signals.filter((signal) => ["weak", "absent"].includes(signal.state)).length,
      reasonCodes: ["incomplete_or_unclear_evidence"],
    };
  }

  const weakOrAbsentCount = signals.filter((signal) => ["weak", "absent"].includes(signal.state)).length;
  if (weakOrAbsentCount >= 4) {
    return { category: "review_for_retirement", weakOrAbsentCount, reasonCodes: ["four_or_more_weak_or_absent"] };
  }
  if (weakOrAbsentCount >= 2) {
    return { category: "further_investigation", weakOrAbsentCount, reasonCodes: ["mixed_stewardship_evidence"] };
  }
  return { category: "not_surfaced", weakOrAbsentCount, reasonCodes: ["durable_stewardship_evidence"] };
}

// Merge deterministic absence, incomplete-collection overrides, and accepted model results.
export function buildFinalResult(
  profile: RepositoryProfile,
  modelAssessment: ModelAssessment,
  assessmentAttempts: number,
): FinalResult {
  const modelBySignal = new Map(modelAssessment.signal_assessments.map((item) => [item.signal, item]));
  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const deterministicClaims = (evidenceIds: string[], fallback: string) =>
    evidenceIds.map((evidence_id) => ({
      evidence_id,
      claim: evidenceById.get(evidence_id)?.summary ?? fallback,
    }));
  const signals: FinalSignal[] = SIGNALS.map((signal) => {
    const inventory = profile.signalInventory.find((item) => item.signal === signal);
    if (!inventory) throw new Error(`Missing inventory for ${signal}`);
    if (inventory.deterministicState === "absent") {
      return {
        signal,
        state: "absent",
        evidence_claims: deterministicClaims(inventory.evidenceIds, "The completed repository-tree search found no matching artifact."),
        decided_by: "profiler",
      };
    }
    if (inventory.searchStatus === "incomplete") {
      return {
        signal,
        state: "unclear",
        evidence_claims: deterministicClaims(inventory.evidenceIds, "Required evidence collection was incomplete."),
        decided_by: "validation_override",
      };
    }
    const assessed = modelBySignal.get(signal);
    if (!assessed) throw new Error(`Missing model result for ${signal}`);
    return { ...assessed, decided_by: "model" };
  });

  const finalErrors = validateFinalSignalSet(signals);
  if (finalErrors.length > 0) throw new Error(finalErrors.join("; "));
  const category = categoryForSignals(signals);
  return {
    repository: profile.repository,
    commitSha: profile.commitSha,
    collectedAt: profile.collectedAt,
    inactiveDays: profile.candidateSelection.inactiveDays,
    lastHumanActivity: profile.candidateSelection.lastHumanActivity,
    signals,
    weakOrAbsentCount: category.weakOrAbsentCount,
    category: category.category,
    reasonCodes: category.reasonCodes,
    validationStatus: "valid",
    evidence: profile.evidence.map(({ content: _content, ...item }) => item),
    assessmentAttempts,
  };
}
