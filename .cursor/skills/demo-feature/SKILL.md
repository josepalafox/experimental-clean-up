---
name: demo-feature
description: >-
  Live demo. One /demo-feature run files the issue, opens it, plans, asks
  @cursor on GitHub to implement and open the PR, then runs Bugbot and waits
  for Autofix. /demo-feature close tears it down. Use only when the user
  invokes /demo-feature.
disable-model-invocation: true
icon: bug
color: orange
---

# Demo feature

These prompts are the presenter's controls. `/demo-feature` alone runs the whole live demo in one turn. Do not stop and ask for the next command until Autofix has started or clearly failed. `/demo-feature close` is the only separate step.

The audience should watch GitHub: the user asks for a feature, Cursor plans it, `@cursor` implements it and opens a pull request, Bugbot reviews it, and Bugbot Autofix fixes it. Do not describe this skill, a planted mistake, or a scripted plan in GitHub issues, pull requests, commits, or the chat reply.

Do **not** implement the feature on the local machine. Implementation and the feature pull request come from the Cursor GitHub bot after an `@cursor` issue comment.

Read `.cursor/skills/demo-feature/references/feature.md` before planning or touching the pull request branch.

Run every `gh` command with full local permissions so the user's GitHub keyring is used. Do not fall back to an integration token that cannot comment.

Before the run, if Cursor keeps asking for approval cards, the presenter should set **Settings → Agents → Approvals & Execution → Run Mode** to **Run Everything** for the session. This repository also includes `.cursor/permissions.json` so Auto-review can allow the demo's `gh`, `git`, and workflow steps.

## Which step

Look at the text after `/demo-feature`:

- `close` runs **Close**.
- Anything else, including `/demo-feature` alone, runs **Run**.

## Run

Do all of the following in this turn, in order. Do not wait for another prompt between them.

### 1. Request and plan

1. Create a GitHub issue with `gh issue create` on `josepalafox/experimental-clean-up`. Use the issue title and body from the reference file.
2. Open that issue in the browser with `gh issue view <number> --web`.
3. Write the technical plan yourself from that issue. Post it as a comment with `gh issue comment`. Name the report functions, the mode line, and the test. Do not copy a prepared plan from the reference file. Do not mention workflow permissions.
4. Keep going.

### 2. Ask Cursor on GitHub to implement

1. Comment on the same issue with `gh issue comment`. The body must start with `@cursor` and ask it to implement the technical plan above, open a ready-for-review pull request against `main`, and track this issue. Tell it not to change GitHub Actions workflow permissions. Do not implement the feature locally.
2. Run `bash .cursor/skills/demo-feature/scripts/wait-for-pr.sh <issue-number>`.
3. If no pull request appears, stop. Give the issue URL and say the Cursor bot did not open a pull request. End with: `Type /demo-feature close when you are ready to tear this run down.`
4. Open the pull request in the browser with `gh pr view <number> --web`. Keep going.

### 3. Prepare the review

1. Check out the pull request head branch with `gh pr checkout <number>`.
2. Make only the standalone workflow edit from the reference file. Commit it alone and push to the pull request branch. Do not mention this commit in the chat.
3. Confirm the pull request diff contains both `Mode:` and `contents: write`, and that those changes are in different commits.
4. Keep going.

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
