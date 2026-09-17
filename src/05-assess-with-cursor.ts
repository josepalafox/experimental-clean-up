import { Agent, type SDKCustomTool, type SDKJsonValue } from "@cursor/sdk";
import { Ajv } from "ajv";
import { validateModelAssessment } from "./06-validate-assessment.js";
import { assessmentSchema, evidenceRequestSchema, evidenceResponseSchema } from "./support/assessment-schema.js";
import { buildAssessmentPrompt, withLineNumbers } from "./support/assessment-prompt.js";
import type { ModelAssessment, RepositoryProfile, Signal } from "./support/domain-types.js";

// Step 05: Runs the bounded Cursor SDK assessment and repair loop.

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
  // Callout: No signals left for model judgment? Skip the SDK; file 07 handles absent or incomplete evidence.
  if (requestedSignals.length === 0) {
    return { assessment: { signal_assessments: [] }, attempts: 0 };
  }

  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const ajv = new Ajv({ allErrors: true });
  // Validate the agent's request shape before looking up local evidence.
  const validateRequest = ajv.compile(evidenceRequestSchema);
  let accepted: ModelAssessment | undefined;
  let latestErrors: string[] = [];

  const customTools: Record<string, SDKCustomTool> = {
    // Callout: request_evidence validates the ID list, checks local IDs, then returns prefetched content only.
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
    submit_assessment: {
      description: "Submit the complete structured assessment. This is the only accepted completion path.",
      inputSchema: assessmentSchema as unknown as Record<string, SDKJsonValue>,
      execute(args) {
        // Callout: 06-validate-assessment.ts checks the submission's schema, signal coverage, IDs, and line ranges.
        // The JSON Schema is in support/assessment-schema.ts; these checks do not prove a claim is true.
        const validation = validateModelAssessment(args, requestedSignals, profile.evidence);
        if (!validation.valid || !validation.assessment) {
          latestErrors = validation.errors;
          return {
            content: [{ type: "text", text: `Assessment rejected:\n${validation.errors.join("\n")}` }],
            isError: true,
          };
        }
        // Callout: Only a valid submit_assessment call sets accepted; prose alone cannot produce a result.
        accepted = validation.assessment;
        latestErrors = [];
        return { accepted: true, message: "Assessment validated." };
      },
    },
  };

  // Callout: Configure the Cursor SDK agent here; expose our two tools without shell, browser, or file tools.
  const agent = await Agent.create({
    apiKey: cursorApiKey,
    model: { id: cursorModel },
    // "mcp" is the SDK capability group required for these in-process custom tools.
    tools: ["mcp"],
    local: {
      cwd: process.cwd(),
      // Do not load ambient settings, including user/project tool configuration.
      settingSources: [],
      customTools,
    },
  });

  try {
    // Callout: At most two sends to this agent: initial assessment, then repair if no result was accepted.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const prompt =
        attempt === 1
          ? buildAssessmentPrompt(profile, requestedSignals)
          : `The previous run did not produce an accepted submit_assessment call. Correct these errors and call submit_assessment now:\n${latestErrors.length ? latestErrors.join("\n") : "No valid structured submission was received."}`;
      // Callout: Start the SDK run with this prompt; support/assessment-prompt.ts builds the initial instructions and excerpts.
      const run = await agent.send(prompt, {
        idempotencyKey: `${profile.repository.id}-${profile.commitSha}-${attempt}`,
      });
      const result = await run.wait();
      // Callout: SDK output returns here to outcome in 02-run-audit.ts, only after an accepted submission.
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
