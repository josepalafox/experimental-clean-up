#!/usr/bin/env bash
# Wait until Bugbot comments on the demo pull request with the permission finding.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-bugbot.sh <pr-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
PR="$1"
NEEDLE="Workflow permission wider than the read-only audit"

for _ in $(seq 1 24); do
  if gh api --paginate "repos/${REPO}/pulls/${PR}/comments" --jq '.[].body' | grep -F "$NEEDLE" >/dev/null; then
    echo "bugbot-commented ${NEEDLE}"
    exit 0
  fi
  sleep 10
done

echo "bugbot-not-yet" >&2
exit 1
