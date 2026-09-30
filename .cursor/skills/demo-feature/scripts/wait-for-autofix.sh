#!/usr/bin/env bash
# Wait until Bugbot Autofix starts for the demo pull request.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-autofix.sh <pr-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
PR="$1"
HEAD_SHA="$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)"

for _ in $(seq 1 18); do
  if gh api "repos/${REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[].name' | grep -F "Cursor Bugbot Autofix" >/dev/null; then
    echo "autofix-started"
    exit 0
  fi
  if gh api --paginate "repos/${REPO}/issues/${PR}/comments" --jq '.[].body' | grep -Ei "autofix" >/dev/null; then
    echo "autofix-started"
    exit 0
  fi
  sleep 10
done

echo "autofix-not-started"
exit 1
