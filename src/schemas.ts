import type { JSONSchemaType } from "ajv";
import type { ModelAssessment } from "./types.js";
import { SIGNALS, SIGNAL_STATES } from "./types.js";

// Callout: This JSON Schema constrains the model to known fields, signals, states, and evidence IDs.
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
        required: ["signal", "state", "evidence_ids", "explanation"],
        properties: {
          signal: { type: "string", enum: [...SIGNALS] },
          state: { type: "string", enum: [...SIGNAL_STATES] },
          evidence_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            uniqueItems: true,
            items: { type: "string", pattern: "^E-[0-9]{3}$" },
          },
          explanation: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  },
};

// Callout: The agent can request only a bounded list of pre-existing evidence identifiers.
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

// Callout: This contract keeps evidence-tool responses predictable for the SDK agent.
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
