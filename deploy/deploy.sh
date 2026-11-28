#!/usr/bin/env bash
# main のコミットを本番へ反映する（nozyjp-server 上で user 権限で実行。sudo 不要）。
#
# 使い方:
#   deploy.sh                  # origin/main の最新を対象
#   deploy.sh <sha>            # 指定コミットを対象（webhook から渡される）
#
# 前提:
#   - $HOME/nameCardManager が対象リポジトリ（ブランチ main）
#   - .env / .env.prod / secrets/ は未追跡で、git reset --hard では消えない
#   - docker compose が user nozyjp から使える
#
# 環境変数:
#   APP_DIR, STATE_DIR, REMOTE, BRANCH, REPO_SLUG, CI_TIMEOUT, HEALTH_TIMEOUT,
#   SKIP_CI_CHECK=1（CI の完了を待たない）, FORCE_REBUILD=1（差分が無くても再ビルド）
#
# 注意: 関数を `func || failed=1` の形で呼ぶと set -e が効かなくなるため、
#       関数内の各コマンドは明示的に `|| return 1` で判定している。
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/nameCardManager}"
STATE_DIR="${STATE_DIR:-$HOME/namecard-deploy}"
LOG_FILE="$STATE_DIR/deploy.log"
LOCK_FILE="$STATE_DIR/deploy.lock"
STATE_FILE="$STATE_DIR/last-deploy"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
REPO_SLUG="${REPO_SLUG:-NOZY-jp/nameCardManager}"
CI_TIMEOUT="${CI_TIMEOUT:-900}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
SKIP_CI_CHECK="${SKIP_CI_CHECK:-0}"
FORCE_REBUILD="${FORCE_REBUILD:-0}"

TARGET_SHA="${1:-}"

mkdir -p "$STATE_DIR"

# 同時実行を防ぐ（2本目は即座に諦める）
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] another deploy is running; skipped" >>"$LOG_FILE"
  exit 0
fi

exec >>"$LOG_FILE" 2>&1
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
trap 'log "ERROR: line $LINENO failed (exit $?)"' ERR

compose() { docker compose --project-directory "$APP_DIR" "$@"; }

# CI の状態を GitHub API から読む（public リポジトリなので認証不要）
ci_state() {
  local sha="$1"
  curl -fsS -m 15 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO_SLUG/commits/$sha/check-runs?per_page=100" 2>/dev/null \
    | python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin).get("check_runs", [])
except Exception:
    print("unknown"); raise SystemExit
if not runs:
    print("pending")
elif any(r.get("status") != "completed" for r in runs):
    print("pending")
elif any(r.get("conclusion") in ("failure", "cancelled", "timed_out", "action_required", "startup_failure") for r in runs):
    print("failure")
else:
    print("success")
' || echo unknown
}

wait_for_ci() {
  local sha="$1" deadline state
  if [ "$SKIP_CI_CHECK" = "1" ]; then
    log "CI check skipped (SKIP_CI_CHECK=1)"
    return 0
  fi
  deadline=$(( $(date +%s) + CI_TIMEOUT ))
  while :; do
    state=$(ci_state "$sha")
    case "$state" in
      success) log "CI: success ($(echo "$sha" | cut -c1-8))"; return 0 ;;
      failure) log "CI: failure ($(echo "$sha" | cut -c1-8)) -> abort"; return 1 ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "CI: timeout after ${CI_TIMEOUT}s ($state) -> abort"
      return 1
    fi
    sleep 20
  done
}

http_code() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000; }

wait_for_health() {
  local deadline backend_code frontend_code
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while :; do
    backend_code=$(http_code http://127.0.0.1:8000/health)
    frontend_code=$(http_code http://127.0.0.1:3001/)
    if [ "$backend_code" = "200" ] && { [ "${frontend_code:0:1}" = "2" ] || [ "${frontend_code:0:1}" = "3" ]; }; then
      log "health: OK (backend=$backend_code frontend=$frontend_code)"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "health: FAILED after ${HEALTH_TIMEOUT}s (backend=$backend_code frontend=$frontend_code)"
      return 1
    fi
    sleep 5
  done
}

# 差分から再ビルド対象のサービスを決める
changed_services() {
  local from="$1" to="$2" files services=() f
  files=$(git -C "$APP_DIR" diff --name-only "$from" "$to" 2>/dev/null || true)
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      frontend/*|pnpm-workspace.yaml) services+=("frontend") ;;
      backend/*) services+=("backend") ;;
      ocr-service/*) services+=("ocr") ;;
      docker/postgres/*) services+=("db") ;;
      docker-compose.yml|docker-compose.yaml|compose.yml|compose.yaml)
        services+=("frontend" "backend") ;;
    esac
  done <<< "$files"
  printf '%s\n' "${services[@]+"${services[@]}"}" | awk 'NF && !seen[$0]++'
}

# 指定コミットのコードでイメージを作り直して起動する
apply() {
  local from="$1" to="$2" build_list running up_list svc

  build_list=$(changed_services "$from" "$to")
  if [ "$FORCE_REBUILD" = "1" ]; then
    build_list=$'frontend\nbackend'
  fi
  # 対象ブランチの構成ファイルが変わったら全サービス
  if git -C "$APP_DIR" diff --name-only "$from" "$to" 2>/dev/null | grep -qxE 'docker-compose\.(yml|yaml)'; then
    build_list=$'frontend\nbackend'
  fi

  if [ -n "$build_list" ]; then
    log "build: $(echo "$build_list" | tr '\n' ' ')"
    for svc in $build_list; do
      compose build "$svc" || { log "build FAILED: $svc"; return 1; }
    done
  else
    log "build: no service changed"
  fi

  # 稼働中 + 今回ビルドしたサービスだけを起動（未使用の ocr を勝手に起こさない）
  running=$(compose ps --services --status running 2>/dev/null | sort -u)
  up_list=$(printf '%s\n%s\n' "$running" "$build_list" | awk 'NF && !seen[$0]++' | tr '\n' ' ')
  log "up: $up_list"
  # shellcheck disable=SC2086
  compose up -d --no-deps $up_list || { log "up FAILED"; return 1; }
  return 0
}

# ---- main ----

git -C "$APP_DIR" fetch --prune "$REMOTE" "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" || {
  log "git fetch failed"; exit 1; }

if [ -n "$TARGET_SHA" ]; then
  TARGET=$(git -C "$APP_DIR" rev-parse --verify --quiet "$TARGET_SHA^{commit}") || {
    log "unknown sha: $TARGET_SHA"; exit 1; }
else
  TARGET=$(git -C "$APP_DIR" rev-parse "$REMOTE/$BRANCH")
fi
PREV=$(git -C "$APP_DIR" rev-parse HEAD)
LAST=""
[ -s "$STATE_FILE" ] && LAST=$(awk '{print $1}' "$STATE_FILE")

if ! git -C "$APP_DIR" merge-base --is-ancestor "$TARGET" "$REMOTE/$BRANCH" 2>/dev/null; then
  log "target $TARGET is not on $REMOTE/$BRANCH -> abort"; exit 1
fi

log "=== deploy ${TARGET:0:8} (checkout ${PREV:0:8}, last deployed ${LAST:0:8}) ==="

if [ "$TARGET" = "$PREV" ] && [ "$TARGET" = "$LAST" ]; then
  log "already deployed; health check only"
  wait_for_health || { log "=== health check failed (no change) ==="; exit 1; }
  log "=== done (no change) ==="
  exit 0
fi

wait_for_ci "$TARGET" || { log "=== aborted before deploy ==="; exit 1; }

git -C "$APP_DIR" checkout -q "$BRANCH" 2>/dev/null || true
git -C "$APP_DIR" reset --hard "$TARGET" || { log "git reset failed"; exit 1; }

NEEDS_MIGRATION=0
if echo "$(changed_services "$PREV" "$TARGET")" | grep -qx backend; then
  NEEDS_MIGRATION=1
fi

FAILED=0
apply "$PREV" "$TARGET" || FAILED=1
[ "$FAILED" -eq 0 ] && { wait_for_health || FAILED=1; }

if [ "$FAILED" -eq 0 ] && [ "$NEEDS_MIGRATION" -eq 1 ]; then
  log "alembic: upgrade head"
  compose exec -T backend alembic upgrade head || { log "alembic FAILED"; FAILED=1; }
  [ "$FAILED" -eq 0 ] && { wait_for_health || FAILED=1; }
fi

if [ "$FAILED" -ne 0 ]; then
  log "deploy failed; rolling back to ${PREV:0:8}"
  git -C "$APP_DIR" reset --hard "$PREV" || log "rollback reset FAILED"
  apply "$TARGET" "$PREV" || log "rollback build FAILED"
  if wait_for_health; then
    log "=== rollback done; production runs ${PREV:0:8} ==="
  else
    log "=== rollback also unhealthy; manual action needed ==="
  fi
  exit 1
fi

printf '%s %s\n' "$TARGET" "$(date '+%F %T')" >"$STATE_FILE"
log "=== deployed ${TARGET:0:8} ==="
compose ps
