#!/usr/bin/env bash
# Wait until the Cursor bot posts a real plan comment on the demo issue.
# Ignores the initial "Taking a look!" acknowledgement, including when that
# same comment is later edited into the plan.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-plan.sh <issue-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
ISSUE="$1"

for _ in $(seq 1 60); do
  found="$(
    gh api --paginate "repos/${REPO}/issues/${ISSUE}/comments" --jq '
      [.[]
        | select((.user.login | ascii_downcase) == "cursor" or (.user.login | ascii_downcase) == "cursor[bot]")
        | select((.body | test("Taking a look!"; "i")) | not)
        | select(.body | test("plan|Mode:|renderProfileSummary|renderAuditReport|Implementation"; "i"))
        | {id, login: .user.login, body: .body}
      ] | .[-1] // empty
    '
  )"
  if [[ -n "$found" && "$found" != "null" ]]; then
    echo "plan-ready"
    python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(f"comment={d[\"id\"]} author={d[\"login\"]}"); print(d["body"][:800])' "$found"
    exit 0
  fi
  sleep 10
done

echo "plan-not-yet" >&2
exit 1
