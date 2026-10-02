#!/usr/bin/env bash
# Reload the issue so the edited plan comment is visible, then return.
# Opening the browser is best-effort: a failed open must not block implementation
# once the plan text is already on the issue.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: show-plan.sh <issue-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
ISSUE="$1"
HOLD_SECONDS=5

if ! found="$(gh api "repos/${REPO}/issues/${ISSUE}/comments?per_page=100" --jq '
  [.[]
    | select(.user.login == "cursor" or .user.login == "cursor[bot]")
    | select((.body | test("Taking a look!"; "i")) | not)
    | select(.body | contains("renderProfileSummary"))
    | select(.body | contains("renderAuditReport"))
    | select(.body | contains("Mode:"))
    | select(.body | test("test"; "i"))
    | .id
  ] | .[-1] // empty
')"; then
  echo "api-error list-comments" >&2
  echo "plan-not-on-issue" >&2
  exit 1
fi

if [[ -z "$found" || "$found" == "null" ]]; then
  echo "plan-not-on-issue" >&2
  exit 1
fi

URL="https://github.com/${REPO}/issues/${ISSUE}#issuecomment-${found}"
if ! gh issue view "$ISSUE" --repo "$REPO" --web; then
  echo "browser-open-failed ${URL}" >&2
fi
echo "opened-issue ${URL}"
echo "plan-comment=${found}"
sleep "$HOLD_SECONDS"
echo "hold-complete"
