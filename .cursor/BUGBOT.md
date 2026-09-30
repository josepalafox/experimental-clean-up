# Bugbot rules

Experimental Clean-up reviews quiet public repositories owned by `josepalafox`. Scanned repositories stay read-only. The cleanup category is assigned in code. The Cursor SDK assessment agent stays sandboxed to two in-process tools.

## Treat these as intended

- `src/support/github-client.ts` reads scanned repositories with GET requests. The only GitHub writes live in `upsertTrackingIssue`, and they target this utility repository (`experimental-clean-up`) only: creating the `cleanup-review` label and creating or updating one tracking issue.
- `.github/workflows/01-audit-trigger.yml` grants `contents: read`. `create_tracking_issue` defaults to false. The workflow does not grant `issues: write`.
- `src/05-assess-with-cursor.ts` creates the SDK agent with `tools: ["mcp"]`, empty `settingSources`, and only `request_evidence` and `submit_assessment`. It has no shell, edit, browser, or GitHub tool.
- `RegExp.prototype.exec` in `src/support/assessment-prompt.ts` parses headings. It is not dynamic code execution.
- `redactSecrets` is best-effort. Do not treat it as a complete secret scanner.
- Numbered callout comments are demo narration. Do not flag them as noise.

## Blocking bugs

If a change adds a GitHub `POST`, `PUT`, `PATCH`, or `DELETE` outside `upsertTrackingIssue`, or makes `upsertTrackingIssue` write to any repository other than `config.owner` / `config.utilityRepository`:

- Add a blocking Bug titled "Write to a scanned repository".
- Body: "Scanned repositories are read-only. Keep GitHub writes inside upsertTrackingIssue and point them only at experimental-clean-up."

If `Agent.create` in `src/05-assess-with-cursor.ts` enables any tool other than the in-process `request_evidence` and `submit_assessment` tools, or `settingSources` is no longer empty:

- Add a blocking Bug titled "Assessment agent left its sandbox".
- Body: "The assessment agent must not receive shell, edit, browser, filesystem, or GitHub tools, and must not load ambient settings."

If an assessment result can set `review_for_retirement`, `further_investigation`, or `not_surfaced` without going through `categoryForSignals` in `src/07-categorize-results.ts`:

- Add a blocking Bug titled "Model chose the cleanup category".
- Body: "The model may judge signals. The category rule stays in deterministic code."

If `reports/latest.json`, `reports/profiles.json`, or the published profile keeps raw evidence `content` from scanned files, including when `withoutFileContents` in `src/02-run-audit.ts` is removed or bypassed:

- Add a blocking Bug titled "Scanned file contents published in the report".
- Body: "Published reports must omit prefetched file bodies. Evidence content can contain secrets that redaction misses."

If `CURSOR_API_KEY`, `GITHUB_TOKEN`, or another credential is written to logs, reports, or the tracking issue:

- Add a blocking Bug titled "Credential written to output".
- Body: "Keep API keys and tokens in the environment. Do not print or persist them."

If the workflow grants `contents: write` or `pull-requests: write`, or grants `issues: write` while `create_tracking_issue` defaults to true:

- Add a blocking Bug titled "Workflow permission wider than the read-only audit".
- Body: "The shipped workflow is read-only. Add issues: write only together with an explicit, default-off tracking-issue path."

If the pull request changes behavior under `src/` and does not update `test/`:

- Add a blocking Bug titled "Missing tests for audit behavior".
- Body: "Behavior changes in src need a matching update under test/."
