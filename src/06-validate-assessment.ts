import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { assessmentSchema } from "./support/assessment-schema.js";
import type { EvidenceItem, ModelAssessment, RepositoryProfile, Signal } from "./support/domain-types.js";
import { SIGNALS } from "./support/domain-types.js";

// Step 06: Validates model structure, evidence references, and signal completeness.

// Callout: Application-side validation independently checks the schema supplied to the agent tool.
const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(assessmentSchema) as ValidateFunction<ModelAssessment>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  assessment?: ModelAssessment;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
}

// Callout: The model receives only signals that deterministic collection could not resolve.
export function unresolvedSignals(profile: RepositoryProfile): Signal[] {
  return profile.signalInventory
    .filter((item) => item.deterministicState === null && item.searchStatus === "complete")
    .map((item) => item.signal);
}

// Callout: This rejects malformed results, invented evidence, duplicates, and missing signals.
export function validateModelAssessment(
  raw: unknown,
  requestedSignals: Signal[],
  evidence: EvidenceItem[],
): ValidationResult {
  if (!validateSchema(raw)) {
    return { valid: false, errors: formatErrors(validateSchema.errors) };
  }

  const errors: string[] = [];
  const seen = new Set<Signal>();
  const requested = new Set(requestedSignals);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  for (const result of raw.signal_assessments) {
    if (!requested.has(result.signal)) errors.push(`Unexpected signal: ${result.signal}`);
    if (seen.has(result.signal)) errors.push(`Duplicate signal: ${result.signal}`);
    seen.add(result.signal);
    for (const evidenceId of result.evidence_ids) {
      const item = evidenceById.get(evidenceId);
      if (!item) {
        errors.push(`Unknown evidence identifier ${evidenceId} for ${result.signal}`);
      } else if (item.signal !== result.signal && item.signal !== "context") {
        errors.push(`Evidence ${evidenceId} does not support signal ${result.signal}`);
      }
    }
  }

  for (const signal of requestedSignals) {
    if (!seen.has(signal)) errors.push(`Missing signal: ${signal}`);
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, errors: [], assessment: raw };
}

// Callout: The final package must contain each of the five signals exactly once.
export function validateFinalSignalSet(signals: Array<{ signal: Signal }>): string[] {
  const counts = new Map<Signal, number>(SIGNALS.map((signal) => [signal, 0]));
  for (const result of signals) counts.set(result.signal, (counts.get(result.signal) ?? 0) + 1);
  return SIGNALS.flatMap((signal) =>
    counts.get(signal) === 1 ? [] : [`Expected ${signal} exactly once; found ${counts.get(signal) ?? 0}`],
  );
}
