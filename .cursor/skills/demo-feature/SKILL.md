---
name: demo-feature
description: >-
  Live demo slash command. Files one feature issue, pauses, implements that
  feature with a deliberate Bugbot finding, pauses for the fix, and can reset
  so the same demo can be run again. Use only when the user invokes
  /demo-feature.
disable-model-invocation: true
icon: bug
color: orange
---

# Demo feature

This is a live, repeatable demo of issue → implement → Bugbot → fix. Follow one stage per user message, then stop. Do not start the next stage in the same turn.

Read `.cursor/skills/demo-feature/references/feature.md` before editing anything. That file is the feature, the planted mistake, and the fix. Do not invent a different feature or a different mistake.

## Which stage

Look at the text after `/demo-feature`:

- `continue` runs **Implement**.
- `fix` runs **Fix**.
- Anything else, including `/demo-feature` alone, runs **File the issue**. That stage always resets a previous demo first.

## File the issue

1. Run `bash .cursor/skills/demo-feature/scripts/reset-demo.sh` from the repository root. If it prints `closed-pr` or `closed-issue`, mention that in one sentence. If it prints `nothing-open`, do not mention a reset.
2. Create a GitHub issue with `gh issue create` on `josepalafox/experimental-clean-up`. Use the title and body from the reference file exactly. The issue must not mention workflow permissions, Bugbot, or a deliberate mistake.
3. Stop. Reply with the issue URL, one sentence naming the feature, and this next step, verbatim: `Type /demo-feature continue when you want me to implement it and open the pull request.`

Do not create a branch, edit code, or open a pull request in this stage.

## Implement

1. Start from a clean `origin/main`. If `git status --porcelain` is not empty, stop and ask the user to stash or commit before the demo continues. Do not carry unrelated files into the demo branch.
2. `git fetch origin main` and `git checkout -B demo/show-audit-mode origin/main`.
3. Make the report change, the test change, and the single permission edit specified in the reference file. The permission edit is required. The demo has failed if the pull request does not change `contents: read` to `contents: write`.
4. Run `npm test`. Do not open the pull request if tests fail.
5. Commit only the report, the audit runner, the test, and the workflow file. The commit message and the pull request title and body describe the mode line only. Do not mention the permission change, Bugbot, or a deliberate mistake.
6. Push `demo/show-audit-mode` and open a pull request into `main` with `gh pr create`. Do not pass `--draft`. If the pull request is a draft, run `gh pr ready`.
7. Confirm `gh pr diff` contains `contents: write` and the `Mode:` report line. If `contents: write` is missing, add it and push before asking Bugbot to review.
8. Comment `bugbot run` on the pull request. Tell the user the pull request URL and that you are waiting for Bugbot before the next prompt.
9. Run `bash .cursor/skills/demo-feature/scripts/wait-for-bugbot.sh <pr-number>`.
10. Stop. If Bugbot commented, reply with the pull request URL, quote the finding title `Workflow permission wider than the read-only audit`, and this next step, verbatim: `Type /demo-feature fix when you want me to correct that finding.` If the wait script exits without a comment, say that Bugbot has not commented yet, include the pull request URL, and still give that same `/demo-feature fix` prompt. Do not fix the finding in this turn.

## Fix

1. Check out `demo/show-audit-mode`. Change workflow `contents: write` back to `contents: read` and change nothing else.
2. Run `npm test`.
3. Commit and push to the same branch. The commit message is `Keep the audit workflow token read-only`.
4. Comment `bugbot run` on the same pull request.
5. Stop. Reply with the pull request URL and say that `contents: read` is restored and Bugbot is reviewing again. End with this next step, verbatim: `Type /demo-feature to close this pull request and run the demo from the beginning.`

Do not merge the pull request.
