import type { JSONSchemaType } from "ajv";
import type { ModelAssessment } from "./domain-types.js";
import { SIGNALS, SIGNAL_STATES } from "./domain-types.js";

// Supporting file: defines the machine-checkable contracts used by the agent tools.

// Defines result shape; file 06 separately checks cited IDs and line ranges against collected evidence.
export const assessmentSchema: JSONSchemaType<ModelAssessment> = {
  type: "object",
  additionalProperties: false,
  required: ["signal_assessments"],
  properties: {
    signal_assessments: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "state", "evidence_claims"],
        properties: {
          signal: { type: "string", enum: [...SIGNALS] },
          state: { type: "string", enum: [...SIGNAL_STATES] },
          evidence_claims: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["evidence_id", "claim"],
              properties: {
                evidence_id: { type: "string", pattern: "^E-[0-9]{3}$" },
                claim: { type: "string", minLength: 1, maxLength: 300 },
                line_start: { type: "integer", minimum: 1, nullable: true },
                line_end: { type: "integer", minimum: 1, nullable: true },
              },
            },
          },
        },
      },
    },
  },
};

// Validates the ID list's format and size; file 05 checks whether the IDs exist.
export const evidenceRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evidence_ids"],
  properties: {
    evidence_ids: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: { type: "string", pattern: "^E-[0-9]{3}$" },
    },
  },
} as const;

// Describes the tool response to the SDK; outputSchema is not runtime validation.
export const evidenceResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "signal", "source_type", "summary", "review_url"],
        properties: {
          id: { type: "string" },
          signal: { type: "string" },
          source_type: { type: "string" },
          path: { type: "string" },
          summary: { type: "string" },
          content: { type: "string" },
          review_url: { type: "string" },
        },
      },
    },
  },
} as const;
