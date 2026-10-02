#!/usr/bin/env bash
# Wait until Cursor replaces its "Taking a look!" issue comment with the plan.
# That edit happens once, after the cloud agent finishes, so poll that comment
# directly and keep going through a failed GitHub API call.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-plan.sh <issue-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
ISSUE="$1"
comment_id=""

is_plan() {
  local body="$1"
  [[ "$body" != *"Taking a look!"* && "$body" != *"taking a look!"* ]] \
    && [[ "$body" == *"renderProfileSummary"* ]] \
    && [[ "$body" == *"renderAuditReport"* ]] \
    && [[ "$body" == *"Mode:"* ]] \
    && [[ "$body" == *[Tt]est* ]]
}

for _ in $(seq 1 90); do
  if [[ -z "$comment_id" ]]; then
    if ! listed="$(gh api "repos/${REPO}/issues/${ISSUE}/comments?per_page=100" --jq '.[] | select(.user.login=="cursor[bot]" or .user.login=="cursor") | .id' 2>&1)"; then
      echo "api-error list-comments" >&2
      printf '%s\n' "$listed" >&2
      sleep 5
      continue
    fi
    comment_id="$(printf '%s\n' "$listed" | awk 'NF { print; exit }')"
  fi

  if [[ -n "$comment_id" ]]; then
    if ! body="$(gh api "repos/${REPO}/issues/comments/${comment_id}" --jq '.body' 2>&1)"; then
      echo "api-error comment=${comment_id}" >&2
      printf '%s\n' "$body" >&2
      sleep 5
      continue
    fi
    if is_plan "$body"; then
      echo "plan-ready"
      echo "comment=${comment_id} author=cursor[bot]"
      printf '%s\n' "$body" | head -c 800
      printf '\n'
      exit 0
    fi
    echo "ack-only comment=${comment_id}"
  else
    echo "plan-not-yet"
  fi
  sleep 5
done

echo "plan-not-yet" >&2
exit 1
