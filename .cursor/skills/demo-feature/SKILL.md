---
name: demo-feature
description: >-
  Live demo. One /demo-feature run files the issue, opens it, plans, implements,
  opens the pull request, runs Bugbot, and waits for Bugbot Autofix with no
  further prompts. /demo-feature close tears it down. Use only when the user
  invokes /demo-feature.
disable-model-invocation: true
icon: bug
color: orange
---

# Demo feature

These prompts are the presenter's controls. `/demo-feature` alone runs the whole live demo in one turn. Do not stop and ask for the next command until Autofix has started or clearly failed. `/demo-feature close` is the only separate step.

The audience should see a normal request on GitHub: the user asks for a feature, Cursor plans it, Cursor implements it, Cursor opens a pull request, Bugbot reviews it, and Bugbot Autofix fixes it. Do not describe this skill, a planted mistake, or a scripted plan in GitHub issues, pull requests, commits, or the chat reply.

Read `.cursor/skills/demo-feature/references/feature.md` before planning, editing, or opening the pull request.

Run every `gh` command with full local permissions so the user's GitHub keyring is used. Do not fall back to an integration token that cannot comment.

## Which step

Look at the text after `/demo-feature`:

- `close` runs **Close**.
- Anything else, including `/demo-feature` alone, runs **Run**.

## Run

Do all of the following in this turn, in order. Do not wait for another prompt between them.

### 1. Request

1. Create a GitHub issue with `gh issue create` on `josepalafox/experimental-clean-up`. Use the issue title and body from the reference file.
2. Open that issue in the browser with `gh issue view <number> --web` so the audience can watch it.
3. Write the technical plan yourself from that issue. Post it as a comment with `gh issue comment`. Name the report functions, the mode line, and the test. Do not copy a prepared plan from the reference file. Do not mention workflow permissions.
4. Keep going. Do not stop here.

### 2. Implement

1. Start from a clean `origin/main`. If `git status --porcelain` is not empty, stop and ask the user to stash or commit first.
2. `git fetch origin main` and `git checkout -B demo/show-audit-mode origin/main`.
3. Implement the plan you posted. The report must show the audit mode, and a test must cover it. Leave `.github/workflows/01-audit-trigger.yml` unchanged.
4. Run `npm test`. Commit only the feature files. The commit message describes the mode line only.
5. Push `demo/show-audit-mode`. Keep going. Do not open the pull request yet.

### 3. Open the pull request

1. Make the standalone workflow edit in the reference file. It must be its own commit, after the feature commit. Push it.
2. Open a pull request into `main` with `gh pr create`. Do not pass `--draft`. The title and body describe only the mode line and link the issue.
3. Confirm the pull request diff contains both `Mode:` and `contents: write`, and that those changes are in different commits.
4. Open the pull request in the browser with `gh pr view <number> --web`.
5. Keep going. Do not mention the workflow commit in the chat.

### 4. Review

1. Comment `bugbot run` on the pull request.
2. Run `bash .cursor/skills/demo-feature/scripts/wait-for-bugbot.sh <pr-number>`.
3. Keep going once Bugbot has commented. If the wait script fails, still continue to Autofix once, then stop if Autofix also fails.

### 5. Autofix

Bugbot Autofix is a Cloud Agent that Bugbot starts. Do not edit the workflow file yourself and do not push a fix commit.

1. Run `bash .cursor/skills/demo-feature/scripts/wait-for-autofix.sh <pr-number>`.
2. Stop. Give the issue URL and the pull request URL.
3. If Autofix started, say Bugbot Autofix is fixing the finding. If it did not, say Bugbot Autofix did not start and that it has to be enabled in the Bugbot dashboard and set to commit to the existing branch.
4. End with this next step, verbatim: `Type /demo-feature close when you are ready to tear this run down.`

## Close

1. Run `bash .cursor/skills/demo-feature/scripts/reset-demo.sh` from the repository root.
2. Do not comment on the pull request or the issue.
3. Stop. Name what was closed, or say there is nothing left to close. End with this next step, verbatim: `Type /demo-feature to start a new run.`
