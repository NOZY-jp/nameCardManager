#!/usr/bin/env bash
# deploy.sh の同期処理を隔離環境（/tmp）で検証する。
#
#   bash deploy/test-sync.sh
#
# 確認すること:
#   1. 同期元が「対象コミット」の deploy/ であり、checkout 済みの古い作業ツリーではない
#   2. 2 回目は差分が無いので daemon-reload / webhook 再起動を呼ばない
#   3. 同期に失敗しても戻り値 0（デプロイ本体を止めない）
#   4. 実行中の deploy.sh 自身は書き換えない（警告のみ）
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY_SH="$HERE/deploy.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

APP_DIR="$ROOT/app"
STATE_DIR="$ROOT/state"
HOME="$ROOT/home"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$APP_DIR/deploy/systemd" "$STATE_DIR" "$UNIT_DIR" "$ROOT/bin"
export APP_DIR STATE_DIR HOME

log() { printf '[test] %s\n' "$*"; }

# 関数だけを取り出して読み込む（main は実行しない）
awk '/^sync_file\(\) \{/,/^# CI の状態/' "$DEPLOY_SH" | sed '$d' >"$ROOT/functions.sh"
# shellcheck source=/dev/null
source "$ROOT/functions.sh"

# --- 2 コミットのリポジトリを作る（作業ツリーは古い方のまま） ---
git -C "$APP_DIR" init -q
git -C "$APP_DIR" config user.email test@example.com
git -C "$APP_DIR" config user.name test
printf 'old-worktree\n' >"$APP_DIR/deploy/webhook.py"
printf 'old-install\n' >"$APP_DIR/deploy/install.sh"
printf 'old-deploy\n' >"$APP_DIR/deploy/deploy.sh"
printf 'old-webhook-unit\n' >"$APP_DIR/deploy/systemd/namecard-webhook.service"
printf 'old-deploy-unit\n' >"$APP_DIR/deploy/systemd/namecard-deploy.service"
printf 'Description=old\n' >"$APP_DIR/deploy/systemd/namecard-deploy.timer"
git -C "$APP_DIR" add -A
git -C "$APP_DIR" commit -q -m old
OLD="$(git -C "$APP_DIR" rev-parse HEAD)"

printf 'target-commit\n' >"$APP_DIR/deploy/webhook.py"
printf 'target-install\n' >"$APP_DIR/deploy/install.sh"
printf 'target-deploy\n' >"$APP_DIR/deploy/deploy.sh"
printf 'target-webhook-unit\n' >"$APP_DIR/deploy/systemd/namecard-webhook.service"
printf 'target-deploy-unit\n' >"$APP_DIR/deploy/systemd/namecard-deploy.service"
printf 'Description=target\n' >"$APP_DIR/deploy/systemd/namecard-deploy.timer"
git -C "$APP_DIR" add -A
git -C "$APP_DIR" commit -q -m target
TARGET="$(git -C "$APP_DIR" rev-parse HEAD)"
git -C "$APP_DIR" checkout -q "$OLD"  # 作業ツリーは old に戻す

for f in webhook.py install.sh namecard-webhook.service namecard-deploy.service namecard-deploy.timer deploy.sh; do
  printf 'stale\n' >"$STATE_DIR/$f"
  [ "$f" = "${f#namecard-}" ] || printf 'stale\n' >"$UNIT_DIR/$f"
done
printf 'stale\n' >"$UNIT_DIR/namecard-webhook.service"
printf 'stale\n' >"$UNIT_DIR/namecard-deploy.service"
printf 'stale\n' >"$UNIT_DIR/namecard-deploy.timer"

# --- systemctl のスタブ ---
cat >"$ROOT/bin/systemctl" <<'EOF'
#!/bin/sh
echo "$@" >>"$SYSTEMCTL_LOG"
EOF
chmod +x "$ROOT/bin/systemctl"
SYSTEMCTL_LOG="$ROOT/systemctl.log"
export SYSTEMCTL_LOG
PATH="$ROOT/bin:$PATH"
export PATH

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# --- 1. 対象コミットの内容が同期される（作業ツリーの old ではない） ---
sync_deploy_files "$TARGET"
[ "$(cat "$STATE_DIR/webhook.py")" = "target-commit" ] || fail "webhook.py is not from target commit"
[ "$(cat "$STATE_DIR/install.sh")" = "target-install" ] || fail "install.sh is not from target commit"
[ "$(cat "$UNIT_DIR/namecard-deploy.timer")" = "Description=target" ] || fail "timer is not from target commit"
[ "$(cat "$APP_DIR/deploy/webhook.py")" = "old-worktree" ] || fail "test setup: worktree should stay old"
[ "$(cat "$STATE_DIR/deploy.sh")" = "stale" ] || fail "running deploy.sh must not be overwritten"

# --- 2. 2 回目は再起動・reload を呼ばない ---
before="$(wc -l <"$SYSTEMCTL_LOG" 2>/dev/null || echo 0)"
sync_deploy_files "$TARGET"
after="$(wc -l <"$SYSTEMCTL_LOG" 2>/dev/null || echo 0)"
[ "$before" = "$after" ] || fail "second sync should not call systemctl ($before -> $after)"

# --- 3. ロールバック（PREV へ reset）後は PREV 版の deploy/ が設置される ---
reset_and_sync "$OLD"
[ "$(cat "$STATE_DIR/webhook.py")" = "old-worktree" ] || fail "rollback sync must install PREV files"

# --- 4. 正常なロールバックは apply と health を実行して成功を返す ---
APPLY_LOG="$ROOT/apply.log"
HEALTH_LOG="$ROOT/health.log"
apply() { echo "apply $*" >>"$APPLY_LOG"; return 0; }
wait_for_health() { echo "health" >>"$HEALTH_LOG"; return 0; }
if ! rollback_to "$OLD" "$TARGET"; then
  fail "successful rollback must return 0"
fi
[ -s "$APPLY_LOG" ] || fail "rollback must rebuild PREV"
[ -s "$HEALTH_LOG" ] || fail "rollback must check health"

# --- 5. reset が失敗したら同期しない（設置物だけ新しくなる不整合を防ぐ） ---
GIT_BIN="$(command -v git)"
cat >"$ROOT/bin/git" <<GITSTUB
#!/bin/sh
case "\$*" in *"reset --hard"*) exit 1 ;; esac
exec "$GIT_BIN" "\$@"
GITSTUB
chmod +x "$ROOT/bin/git"
hash -r
printf 'before-reset
' >"$STATE_DIR/webhook.py"
if reset_and_sync "$TARGET"; then
  fail "reset failure must return non-zero"
fi
[ "$(cat "$STATE_DIR/webhook.py")" = "before-reset" ] || fail "reset failure must not sync deploy files"

# rollback 呼び出し側: reset 失敗では再ビルド・health をせず異常終了し、マーカーを残す
printf '%s %s
' "$TARGET" 0 >"$STATE_DIR/failed-deploy"
apply_calls_before="$(wc -l <"$APPLY_LOG")"
health_calls_before="$(wc -l <"$HEALTH_LOG")"
if rollback_to "$TARGET" "$OLD"; then
  fail "rollback must fail when reset fails"
fi
[ "$(wc -l <"$APPLY_LOG")" = "$apply_calls_before" ] || fail "rollback reset failure must not rebuild"
[ "$(wc -l <"$HEALTH_LOG")" = "$health_calls_before" ] || fail "rollback reset failure must not check health"
[ -s "$STATE_DIR/failed-deploy" ] || fail "rollback reset failure must keep failed-deploy marker"

rm -f "$ROOT/bin/git"
hash -r

# --- 6. 同期失敗でも戻り値 0（デプロイを止めない） ---
printf '#!/bin/sh\nexit 1\n' >"$ROOT/bin/install"
chmod +x "$ROOT/bin/install"
hash -r  # bash のコマンドパスキャッシュを捨ててスタブを使う
printf 'stale2\n' >"$STATE_DIR/webhook.py"
if ! sync_deploy_files "$TARGET"; then
  fail "sync failure must not abort deploy"
fi
[ "$(cat "$STATE_DIR/webhook.py")" = "stale2" ] || fail "failed install must leave file as-is"

printf 'OK: sync uses target commit, stays idempotent, and never aborts deploy\n'
