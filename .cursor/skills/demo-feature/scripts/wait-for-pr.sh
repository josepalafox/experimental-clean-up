#!/usr/bin/env bash
# Wait until a pull request that tracks the demo issue is opened.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-pr.sh <issue-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
ISSUE="$1"
TITLE="Show the audit mode on the cleanup report"

for _ in $(seq 1 60); do
  pr_json="$(
    gh pr list --repo "$REPO" --state open --limit 20 --json number,title,url,body \
      --jq ".[] | select(.title == \"$TITLE\" or (.body | contains(\"#${ISSUE}\"))) | {number, url}"
  )"
  if [[ -n "$pr_json" ]]; then
    echo "$pr_json" | head -n 1
    echo "pr-ready"
    exit 0
  fi
  sleep 10
done

echo "pr-not-yet" >&2
exit 1
