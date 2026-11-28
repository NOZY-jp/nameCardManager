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
RETRY_COOLDOWN=1800
STATE_DIR="$ROOT/state"
mkdir -p "$STATE_DIR"
export REPO_SLUG CI_TIMEOUT SKIP_CI_CHECK RETRY_COOLDOWN STATE_DIR

log() { printf '%s\n' "$*"; }

# 関数だけを取り出す（ci_state と wait_for_ci）
awk '/^ci_state\(\) \{/,/^http_code\(\)/' "$HERE/deploy.sh" | sed '$d' >"$ROOT/functions.sh"
# retry_suppressed は main の直前にあるため別途取り出す
awk '/^retry_suppressed\(\) \{/,/^if retry_suppressed /' "$HERE/deploy.sh" | sed '$d' >>"$ROOT/functions.sh"
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
  *"CI not successful (cancelled) after 0s"*) ;;
  *) fail "timeout log missing: $out" ;;
esac
# timeout で failed-deploy が書かれる（sha / epoch / 理由）
read -r marker_sha marker_at marker_reason < "$STATE_DIR/failed-deploy" || true
[ "$marker_sha" = "deadbeef" ] || fail "timeout must record failed-deploy sha"
[ "$marker_reason" = "ci-cancelled" ] || fail "timeout must record reason: $marker_reason"
case "$marker_at" in
  ''|*[!0-9]*) fail "timeout marker epoch missing" ;;
esac

# wait_for_ci: success は成功、failure は中止
write_runs '[{"status":"completed","conclusion":"success"}]'
wait_for_ci deadbeef >/dev/null 2>&1 || fail "success must return 0"
write_runs '[{"status":"completed","conclusion":"failure"}]'
if wait_for_ci deadbeef >/dev/null 2>&1; then
  fail "failure must return non-zero"
fi


# --- retry_suppressed: クールダウンと別 sha の扱い ---
if ! retry_suppressed deadbeef; then
  fail "recent marker must suppress retry"
fi

# クールダウン超過 + CI 失敗の理由なら、待たずに中止して時刻だけ更新
printf 'deadbeef 1 ci-cancelled
' >"$STATE_DIR/failed-deploy"
rc=0
retry_suppressed deadbeef || rc=$?
[ "$rc" -eq 1 ] || fail "old ci marker must abort immediately"
read -r _ at2 _ < "$STATE_DIR/failed-deploy" || true
[ "${at2:-0}" -gt 1 ] || fail "retry abort must refresh marker epoch"

# deploy 失敗（理由 deploy）は通常どおり CI を待つ
printf 'deadbeef 1 deploy
' >"$STATE_DIR/failed-deploy"
rc=0
retry_suppressed deadbeef || rc=$?
[ "$rc" -eq 2 ] || fail "deploy marker must not skip CI wait"

# 別 sha は抑止しない
printf 'othersha 1 ci-cancelled
' >"$STATE_DIR/failed-deploy"
rc=0
retry_suppressed deadbeef || rc=$?
[ "$rc" -eq 2 ] || fail "different sha must not be suppressed"

printf 'OK: cancelled/stale are pending, failure aborts, success passes, timeout marks and suppresses retries
'
