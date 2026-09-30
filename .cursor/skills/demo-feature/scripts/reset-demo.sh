#!/usr/bin/env bash
# Close the previous live-demo issue and pull request so /demo-feature can start over.
set -euo pipefail

REPO="josepalafox/experimental-clean-up"
BRANCH="demo/show-audit-mode"
TITLE="Show the audit mode on the cleanup report"
closed_any=0

pr_numbers="$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[].number')"
for number in $pr_numbers; do
  gh pr close "$number" --repo "$REPO" --delete-branch --comment "Resetting the live demo so it can be run again."
  echo "closed-pr $number"
  closed_any=1
done

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git push origin --delete "$BRANCH"
  echo "deleted-branch $BRANCH"
  closed_any=1
fi

issue_numbers="$(
  gh issue list --repo "$REPO" --state open --limit 20 --search "$TITLE" --json number,title \
    --jq ".[] | select(.title == \"$TITLE\") | .number"
)"
for number in $issue_numbers; do
  gh issue close "$number" --repo "$REPO" --comment "Resetting the live demo so it can be run again."
  echo "closed-issue $number"
  closed_any=1
done

if [[ "$closed_any" -eq 0 ]]; then
  echo "nothing-open"
fi
