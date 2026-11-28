#!/usr/bin/env bash
# deploy.sh の CI 判定（ci_state / wait_for_ci）を隔離環境で検証する。
#
#   bash deploy/test-ci-state.sh
#
# cancelled / stale は failure ではなく pending（waiting）として扱い、
# failure の結論だけがデプロイ中止になることを確認する。
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/bin"

REPO_SLUG="example/repo"
CI_TIMEOUT=0
SKIP_CI_CHECK=0
export REPO_SLUG CI_TIMEOUT SKIP_CI_CHECK

log() { printf '%s\n' "$*"; }

# 関数だけを取り出す（ci_state と wait_for_ci）
awk '/^ci_state\(\) \{/,/^http_code\(\)/' "$HERE/deploy.sh" | sed '$d' >"$ROOT/functions.sh"
# shellcheck source=/dev/null
source "$ROOT/functions.sh"

FAKE_JSON="$ROOT/check-runs.json"
export FAKE_JSON
cat >"$ROOT/bin/curl" <<'EOF'
#!/bin/sh
cat "$FAKE_JSON"
EOF
chmod +x "$ROOT/bin/curl"
# Windows など python3 が無い環境では python で代用する
if ! command -v python3 >/dev/null 2>&1; then
  cat >"$ROOT/bin/python3" <<'EOF'
#!/bin/sh
exec python "$@"
EOF
  chmod +x "$ROOT/bin/python3"
fi
PATH="$ROOT/bin:$PATH"
export PATH
hash -r

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

write_runs() { # write_runs <json array>
  printf '{"check_runs":%s}\n' "$1" >"$FAKE_JSON"
}

write_runs '[{"status":"completed","conclusion":"success"}]'
[ "$(ci_state deadbeef)" = "success success" ] || fail "success not detected"

write_runs '[{"status":"completed","conclusion":"failure"}]'
[ "$(ci_state deadbeef)" = "failure failure" ] || fail "failure not detected"

write_runs '[{"status":"completed","conclusion":"cancelled"}]'
[ "$(ci_state deadbeef)" = "pending cancelled" ] || fail "cancelled must be pending"

write_runs '[{"status":"completed","conclusion":"stale"}]'
[ "$(ci_state deadbeef)" = "pending stale" ] || fail "stale must be pending"

write_runs '[{"status":"completed","conclusion":"success"},{"status":"completed","conclusion":"cancelled"}]'
[ "$(ci_state deadbeef)" = "pending cancelled" ] || fail "success+cancelled must be pending"

write_runs '[{"status":"in_progress","conclusion":null}]'
[ "$(ci_state deadbeef)" = "pending pending" ] || fail "in-progress must be pending"

write_runs '[]'
[ "$(ci_state deadbeef)" = "pending pending" ] || fail "no runs must be pending"

write_runs '[{"status":"completed","conclusion":"timed_out"}]'
[ "$(ci_state deadbeef)" = "failure timed_out" ] || fail "timed_out must be failure"

# wait_for_ci: cancelled は中止せず waiting を出し、タイムアウトで終わる
write_runs '[{"status":"completed","conclusion":"cancelled"}]'
out="$(wait_for_ci deadbeef 2>&1)" && fail "cancelled must not succeed"
case "$out" in
  *"CI: cancelled"*"-> waiting"*) ;;
  *) fail "cancelled log missing: $out" ;;
esac
case "$out" in
  *"CI: failure"*) fail "cancelled must not be logged as failure: $out" ;;
esac
case "$out" in
  *"timeout after 0s (cancelled)"*) ;;
  *) fail "timeout log missing: $out" ;;
esac

# wait_for_ci: success は成功、failure は中止
write_runs '[{"status":"completed","conclusion":"success"}]'
wait_for_ci deadbeef >/dev/null 2>&1 || fail "success must return 0"
write_runs '[{"status":"completed","conclusion":"failure"}]'
if wait_for_ci deadbeef >/dev/null 2>&1; then
  fail "failure must return non-zero"
fi

printf 'OK: cancelled/stale are pending, failure aborts, success passes\n'
