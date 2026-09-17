import { Agent, type SDKCustomTool, type SDKJsonValue } from "@cursor/sdk";
import { Ajv } from "ajv";
import { validateModelAssessment } from "./06-validate-assessment.js";
import { assessmentSchema, evidenceRequestSchema, evidenceResponseSchema } from "./support/assessment-schema.js";
import { buildAssessmentPrompt, withLineNumbers } from "./support/assessment-prompt.js";
import type { ModelAssessment, RepositoryProfile, Signal } from "./support/domain-types.js";

// Step 05: Runs the bounded Cursor SDK assessment and repair loop.

// Callout: One repair attempt makes invalid structured output recoverable without an open-ended loop.
const MAX_ATTEMPTS = 2;

export interface AssessmentOutcome {
  assessment: ModelAssessment;
  attempts: number;
}

export async function assessProfile(
  profile: RepositoryProfile,
  cursorApiKey: string,
  cursorModel: string,
  requestedSignals: Signal[],
): Promise<AssessmentOutcome> {
  // Callout: Skip the model when deterministic collection resolved every signal;
  // 07-categorize-results.ts can finish from the collected evidence alone.
  if (requestedSignals.length === 0) {
    return { assessment: { signal_assessments: [] }, attempts: 0 };
  }

  // Callout: Both tools close over this local evidence bundle and need no GitHub access.
  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const ajv = new Ajv({ allErrors: true });
  // Validate the agent's request shape before looking up local evidence.
  const validateRequest = ajv.compile(evidenceRequestSchema);
  let accepted: ModelAssessment | undefined;
  let latestErrors: string[] = [];

  // Callout: These two custom tools are the agent's complete capability surface.
  const customTools: Record<string, SDKCustomTool> = {
    request_evidence: {
      description: "Retrieve full, pre-collected evidence items by identifier. This tool has no network access.",
      inputSchema: evidenceRequestSchema as unknown as Record<string, SDKJsonValue>,
      outputSchema: evidenceResponseSchema as unknown as Record<string, SDKJsonValue>,
      execute(args) {
        if (!validateRequest(args)) {
          return {
            content: [{ type: "text", text: `Invalid evidence request: ${ajv.errorsText(validateRequest.errors)}` }],
            isError: true,
          };
        }
        const ids = args.evidence_ids as string[];
        const missing = ids.filter((id) => !evidenceById.has(id));
        if (missing.length > 0) {
          return {
            content: [{ type: "text", text: `Unknown evidence identifiers: ${missing.join(", ")}` }],
            isError: true,
          };
        }
        return {
          items: ids.map((id) => {
            const item = evidenceById.get(id)!;
            return {
              id: item.id,
              signal: item.signal,
              source_type: item.sourceType,
              ...(item.path ? { path: item.path } : {}),
              summary: item.summary,
              ...(item.content ? { content: withLineNumbers(item.content) } : {}),
              review_url: item.reviewUrl,
            };
          }),
        };
      },
    },
    // Callout: This tool enforces the JSON Schema and is the only accepted completion path.
    submit_assessment: {
      description: "Submit the complete structured assessment. This is the only accepted completion path.",
      inputSchema: assessmentSchema as unknown as Record<string, SDKJsonValue>,
      execute(args) {
        const validation = validateModelAssessment(args, requestedSignals, profile.evidence);
        if (!validation.valid || !validation.assessment) {
          latestErrors = validation.errors;
          return {
            content: [{ type: "text", text: `Assessment rejected:\n${validation.errors.join("\n")}` }],
            isError: true,
          };
        }
        accepted = validation.assessment;
        latestErrors = [];
        return { accepted: true, message: "Assessment validated." };
      },
    },
  };

  // Callout: This is where the application starts the Cursor SDK agent.
  const agent = await Agent.create({
    apiKey: cursorApiKey,
    model: { id: cursorModel },
    // Callout: The SDK custom-tool channel exposes only the two tools above; shell, browser, file, edit, and subagent tools are omitted.
    tools: ["mcp"],
    local: {
      cwd: process.cwd(),
      // Callout: Empty setting sources prevent user or project configuration from adding capabilities.
      settingSources: [],
      customTools,
    },
  });

  try {
    // Callout: Validation errors are returned to the same agent for one bounded repair attempt.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const prompt =
        attempt === 1
          ? buildAssessmentPrompt(profile, requestedSignals)
          : `The previous run did not produce an accepted submit_assessment call. Correct these errors and call submit_assessment now:\n${latestErrors.length ? latestErrors.join("\n") : "No valid structured submission was received."}`;
      const run = await agent.send(prompt, {
        // Callout: This identifies the repository, pinned commit, and logical assessment attempt.
        idempotencyKey: `${profile.repository.id}-${profile.commitSha}-${attempt}`,
      });
      const result = await run.wait();
      if (accepted) return { assessment: accepted, attempts: attempt };
      if (result.status === "error") {
        latestErrors = [result.error?.message ?? "Cursor SDK run failed"];
      }
    }
  } finally {
    agent.close();
  }

  throw new Error(`No valid assessment after ${MAX_ATTEMPTS} attempts: ${latestErrors.join("; ")}`);
}
