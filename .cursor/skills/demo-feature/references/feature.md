# Demo feature contract

Repository: `josepalafox/experimental-clean-up`

Branch: `demo/show-audit-mode`

Base: `origin/main`

## Issue

Title:

```text
Show the audit mode on the cleanup report
```

Body:

```markdown
## User story

As an operator reading an Experimental Clean-up report, I want the run mode printed at the top, so I can tell a profile run from an assessment run without opening the workflow logs.

## Scope

- Print `Mode: profile` or `Mode: assess` near the top of the Markdown report.
- Cover the profile summary and the assessment report.
- Add a test that the rendered report contains the mode.

## Out of scope

- Workflow permissions
- The inactivity gate, evidence collection, and cleanup categories
```

## Report change

In `src/08-render-report.ts`, change `renderProfileSummary` so it takes the mode and prints it:

```typescript
export function renderProfileSummary(
  profiles: RepositoryProfile[],
  enumerated: number,
  mode: "profile" | "assess",
): string {
  const lines = [
    "# Experimental cleanup profile",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${mode}`,
    `Repositories enumerated: ${enumerated}`,
    `Candidates selected: ${profiles.length}`,
    "",
```

Leave the rest of that function as it is.

In `renderAuditReport`, add the mode immediately after the generated line:

```typescript
    `Generated: ${summary.generatedAt}`,
    `Mode: ${summary.mode}`,
```

In `src/02-run-audit.ts`, pass the profile mode at the only call site:

```typescript
    const report = renderProfileSummary(publishedProfiles, repositories.length, "profile");
```

## Test

In `test/report.test.ts`:

- Import `renderProfileSummary`.
- In the existing assessment test, expect the report to contain `Mode: assess`.
- Add a test that `renderProfileSummary([], 0, "profile")` contains `Mode: profile`.

## Planted mistake

In `.github/workflows/01-audit-trigger.yml`, under `permissions`, change the single line `contents: read` to `contents: write`.

Do not add `issues: write`. Do not change `create_tracking_issue`. Do not edit the comment above `permissions`. This is the only workflow edit.

Bugbot's rule for this line is titled `Workflow permission wider than the read-only audit`.

## Fix

Change that same line back to `contents: read`. Do not revert the mode lines or the test.
