import type {
  Category,
  FinalResult,
  FinalSignal,
  ModelAssessment,
  RepositoryProfile,
} from "./types.js";
import { SIGNALS } from "./types.js";
import { validateFinalSignalSet } from "./validate.js";

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

export function buildFinalResult(
  profile: RepositoryProfile,
  modelAssessment: ModelAssessment,
  assessmentAttempts: number,
): FinalResult {
  const modelBySignal = new Map(modelAssessment.signal_assessments.map((item) => [item.signal, item]));
  const signals: FinalSignal[] = SIGNALS.map((signal) => {
    const inventory = profile.signalInventory.find((item) => item.signal === signal);
    if (!inventory) throw new Error(`Missing inventory for ${signal}`);
    if (inventory.deterministicState === "absent") {
      return {
        signal,
        state: "absent",
        evidence_ids: inventory.evidenceIds,
        explanation: "The completed repository inventory found no matching artifact.",
        decided_by: "profiler",
      };
    }
    if (inventory.searchStatus === "incomplete") {
      return {
        signal,
        state: "unclear",
        evidence_ids: inventory.evidenceIds,
        explanation: "Required evidence collection was incomplete.",
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
