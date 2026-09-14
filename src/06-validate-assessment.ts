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

// Callout: This rejects malformed results, invented evidence, invalid line ranges, and missing signals.
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
    const claimEvidenceIds = new Set<string>();
    for (const claim of result.evidence_claims) {
      if (claimEvidenceIds.has(claim.evidence_id)) {
        errors.push(`Duplicate evidence claim ${claim.evidence_id} for ${result.signal}`);
      }
      claimEvidenceIds.add(claim.evidence_id);
      const item = evidenceById.get(claim.evidence_id);
      if (!item) {
        errors.push(`Unknown evidence identifier ${claim.evidence_id} for ${result.signal}`);
      } else if (item.signal !== result.signal && item.signal !== "context") {
        errors.push(`Evidence ${claim.evidence_id} does not support signal ${result.signal}`);
      } else if (item.sourceType === "file") {
        const lineCount = item.content?.split("\n").length ?? 0;
        if (!claim.line_start || !claim.line_end) {
          errors.push(`File evidence ${claim.evidence_id} requires a line range`);
        } else if (claim.line_start > claim.line_end || claim.line_end > lineCount) {
          errors.push(`Invalid line range for ${claim.evidence_id}`);
        }
      } else if (claim.line_start || claim.line_end) {
        errors.push(`Non-file evidence ${claim.evidence_id} must not include a line range`);
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
