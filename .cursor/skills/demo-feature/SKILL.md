---
name: demo-feature
description: >-
  Live demo prompts for a normal feature workflow: request, plan, implement,
  pull request, Bugbot review, Bugbot Autofix, and close. Use only when the
  user invokes /demo-feature.
disable-model-invocation: true
icon: bug
color: orange
---

# Demo feature

These prompts are the presenter's controls. Each one runs one visible step and stops. Do not start the next step in the same turn.

The audience should see a normal request: the user asks for a feature, Cursor plans it, Cursor implements it, Cursor opens a pull request, Bugbot reviews it, and Bugbot Autofix fixes it. Do not describe this skill, a planted mistake, or a scripted plan in GitHub issues, pull requests, commits, or the chat reply.

Read `.cursor/skills/demo-feature/references/feature.md` before planning, editing, or opening the pull request.

## Which step

Look at the text after `/demo-feature`:

- `plan` runs **Plan**.
- `implement` runs **Implement**.
- `pr` runs **Open the pull request**.
- `review` runs **Review**.
- `autofix` runs **Autofix**.
- `close` runs **Close**.
- Anything else, including `/demo-feature` alone, runs **Request**.

## Request

1. Create a GitHub issue with `gh issue create` on `josepalafox/experimental-clean-up`. Use the issue title and body from the reference file.
2. Stop. Reply with the issue URL and one sentence that restates the request. End with this next step, verbatim: `Type /demo-feature plan to plan the implementation.`

Do not mention a previous run. Do not plan, edit code, or open a pull request.

## Plan

1. Read the latest open issue whose title is exactly `Show the audit mode on the cleanup report`.
2. Write the technical plan yourself from that issue. Post it as a comment on the issue with `gh issue comment`, and show the same plan in the chat. Name the report functions, the mode line, and the test. Do not copy a prepared plan from the reference file.
3. Stop. End with this next step, verbatim: `Type /demo-feature implement to build the plan.`

Do not edit code or open a pull request. Do not mention workflow permissions.

## Implement

1. Start from a clean `origin/main`. If `git status --porcelain` is not empty, stop and ask the user to stash or commit first.
2. `git fetch origin main` and `git checkout -B demo/show-audit-mode origin/main`.
3. Implement the plan you posted. The report must show the audit mode, and a test must cover it. Leave `.github/workflows/01-audit-trigger.yml` unchanged.
4. Run `npm test`. Commit only the feature files. The commit message describes the mode line only.
5. Push `demo/show-audit-mode`. Do not open a pull request.
6. Stop. Say the implementation is committed and give the branch name. End with this next step, verbatim: `Type /demo-feature pr to open the pull request.`

## Open the pull request

1. Check out `demo/show-audit-mode`.
2. Make the standalone workflow edit in the reference file. It must be its own commit, after the feature commit. Push it.
3. Open a pull request into `main` with `gh pr create`. Do not pass `--draft`. The title and body describe only the mode line and link the issue. If `gh pr create` fails, open the same ready-for-review pull request another way.
4. Confirm the pull request diff contains both `Mode:` and `contents: write`, and that those changes are in different commits.
5. Stop. Reply with only the pull request URL. Do not mention the workflow commit. End with this next step, verbatim: `Type /demo-feature review to have Bugbot review it.`

Do not comment `bugbot run` in this step. Do not fix the workflow edit.

## Review

1. Comment `bugbot run` on the demo pull request.
2. Run `bash .cursor/skills/demo-feature/scripts/wait-for-bugbot.sh <pr-number>`.
3. Stop. If Bugbot commented, quote the finding title `Workflow permission wider than the read-only audit` and give the pull request URL. End with this next step, verbatim: `Type /demo-feature autofix to have Bugbot Autofix fix it.`
4. If Bugbot has not commented, say so, include the pull request URL, and give that same next step.

Do not edit the code.

## Autofix

Bugbot Autofix is a Cloud Agent that Bugbot starts. Do not edit the workflow file yourself and do not push a fix commit.

1. Run `bash .cursor/skills/demo-feature/scripts/wait-for-autofix.sh <pr-number>`.
2. If it prints `autofix-started`, stop. Give the pull request URL and say Bugbot Autofix is fixing the finding. End with this next step, verbatim: `Type /demo-feature close when you are ready to tear this run down.`
3. If it prints `autofix-not-started`, stop. Say that Bugbot Autofix did not start, and that it has to be enabled in the Bugbot dashboard and set to commit to the existing branch. Do not fix the code. End with the same `/demo-feature close` sentence.

## Close

1. Run `bash .cursor/skills/demo-feature/scripts/reset-demo.sh` from the repository root.
2. Do not comment on the pull request or the issue.
3. Stop. Name what was closed, or say there is nothing left to close. End with this next step, verbatim: `Type /demo-feature to start a new run.`
