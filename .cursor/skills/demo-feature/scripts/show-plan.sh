#!/usr/bin/env bash
# Print the demo plan in the terminal so the presenter can talk through it.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: show-plan.sh <issue-number> <plan-file>" >&2
  exit 2
fi

ISSUE="$1"
PLAN_FILE="$2"

echo
echo "════════════════════════════════════════════════════════"
echo " Running plan mode on issue #${ISSUE}..."
echo "════════════════════════════════════════════════════════"
echo
cat "$PLAN_FILE"
echo
echo "════════════════════════════════════════════════════════"
echo " Plan ready. Posting it to the issue, then asking @cursor"
echo " to implement while you talk through the plan above."
echo "════════════════════════════════════════════════════════"
echo
