#!/usr/bin/env bash
# Wait until the Cursor bot posts a new comment on the demo issue (the plan).
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: wait-for-plan.sh <issue-number>" >&2
  exit 2
fi

REPO="josepalafox/experimental-clean-up"
ISSUE="$1"

existing_ids="$(
  gh api --paginate "repos/${REPO}/issues/${ISSUE}/comments" \
    --jq '.[].id' | sort -n | tr '\n' ' '
)"

for _ in $(seq 1 60); do
  while IFS=$'\t' read -r id login body; do
    [[ -z "${id:-}" ]] && continue
    if [[ " ${existing_ids} " == *" ${id} "* ]]; then
      continue
    fi
    login_lc="$(printf '%s' "$login" | tr '[:upper:]' '[:lower:]')"
    if [[ "$login_lc" != "cursor" && "$login_lc" != "cursor[bot]" ]]; then
      continue
    fi
    echo "plan-ready comment=${id} author=${login}"
    printf '%s\n' "$body" | fold -s -w 100 | head -n 30
    exit 0
  done < <(
    gh api --paginate "repos/${REPO}/issues/${ISSUE}/comments" \
      --jq '.[] | [.id, .user.login, (.body | gsub("\t"; " ") | gsub("\n"; " "))] | @tsv'
  )
  sleep 10
done

echo "plan-not-yet" >&2
exit 1
