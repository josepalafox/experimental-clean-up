#!/usr/bin/env bash
# Close the live-demo issue and pull request. Used only by /demo-feature close.
# Do not add a comment. The pull request thread is the demo.
set -euo pipefail

REPO="josepalafox/experimental-clean-up"
TITLE="Show the audit mode on the cleanup report"
closed_any=0

pr_numbers="$(
  gh pr list --repo "$REPO" --state open --limit 20 --json number,title \
    --jq ".[] | select(.title == \"$TITLE\") | .number"
)"
for number in $pr_numbers; do
  gh pr close "$number" --repo "$REPO" --delete-branch
  echo "closed-pr $number"
  closed_any=1
done

if git ls-remote --exit-code --heads origin "demo/show-audit-mode" >/dev/null 2>&1; then
  git push origin --delete "demo/show-audit-mode"
  echo "deleted-branch demo/show-audit-mode"
  closed_any=1
fi

issue_numbers="$(
  gh issue list --repo "$REPO" --state open --limit 20 --search "$TITLE" --json number,title \
    --jq ".[] | select(.title == \"$TITLE\") | .number"
)"
for number in $issue_numbers; do
  gh issue close "$number" --repo "$REPO"
  echo "closed-issue $number"
  closed_any=1
done

if [[ "$closed_any" -eq 0 ]]; then
  echo "nothing-open"
fi
