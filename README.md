# Experimental Clean-up

Experimental Clean-up finds quiet public repositories that may merit a cleanup conversation. It first applies a deterministic human-activity gate, then uses the Cursor SDK to assess five signs of durable stewardship: shared prompts, skills or specifications, CI, ownership, and onboarding.

The output is an evidence-linked review list. It is not a deletion decision, and the application never writes to scanned repositories.

## How it works

1. Enumerate public, non-fork repositories owned by `josepalafox`.
2. Select repositories with at least 14 days of inactivity after checking human commits, releases, issue activity, and security-issue closure.
3. Inventory relevant files and prefetch their contents at a pinned commit.
4. Give a Cursor SDK agent access only to two in-process tools:
   - `request_evidence` returns selected items from the prefetched bundle.
   - `submit_assessment` accepts the five-signal assessment through a JSON Schema contract.
5. Validate the submission, return actionable errors, and allow one repair attempt.
6. Apply the final category rule in deterministic code and write Markdown and JSON reports.
7. Optionally create or update one central `cleanup-review` issue in this repository.

The agent has no shell, edit, browser, or GitHub tool. Repository text is treated as untrusted evidence. GitHub reads and the optional central issue write are performed by deterministic application code.

## Run locally

Requires Node.js 24 or newer.

```bash
npm install
npm run profile
```

Profiling does not use Cursor and writes `reports/latest.md` plus the collected profiles. For the full assessment:

```bash
export CURSOR_API_KEY="..."
AUDIT_MODE=assess npm run audit
```

Useful settings:

| Variable | Default | Purpose |
|---|---:|---|
| `INACTIVITY_DAYS` | `14` | Human-inactivity threshold |
| `MAX_ASSESSMENTS` | `10` | Per-run model assessment cap |
| `MAX_GITHUB_REQUESTS` | `500` | Hard GitHub request budget |
| `CURSOR_MODEL` | `auto` | Cursor model selection |
| `CREATE_TRACKING_ISSUE` | `false` | Upsert the central review issue |

## GitHub Actions

The workflow is manually triggered. Add `CURSOR_API_KEY` as a repository secret before choosing `assess`. GitHub automatically supplies the workflow token used for public repository reads and the optional central issue; no separate GitHub secret is required.

The checked-in schedule is intentionally commented out. It can be enabled after the signal quality and operating cost are understood.

## Categories

| Rule | Category |
|---|---|
| Any signal is unclear | `further_investigation` |
| Four or five signals are weak or absent | `review_for_retirement` |
| Two or three signals are weak or absent | `further_investigation` |
| Zero or one signal is weak or absent | `not_surfaced` |

Every surfaced result includes links to the exact repository artifacts used as evidence. A human must still confirm ownership and operational use before archiving or deleting anything.
