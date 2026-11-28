#!/usr/bin/env bash
# nozyjp-server 上で 1 回だけ実行する設置スクリプト（sudo 不要）。
#
#   ~/nameCardManager/deploy/install.sh   # リポジトリから（更新反映）
#   ~/namecard-deploy/install.sh          # 設置先から（自己修復）
#
# 行うこと:
#   1. deploy.sh / webhook.py / systemd unit を ~/namecard-deploy/ へ複製
#      （git reset --hard で消えない場所に置き、実行中のスクリプトが書き換わらないようにする）
#   2. webhook.secret が無ければ生成（600）
#   3. systemd --user の unit を設置し、webhook 常駐と 15 分おきのフォールバック poll を有効化
#
# 再実行しても安全。
set -Eeuo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
STATE_DIR="${STATE_DIR:-$HOME/namecard-deploy}"
UNIT_DIR="$HOME/.config/systemd/user"

mkdir -p "$STATE_DIR" "$UNIT_DIR"
STATE_DIR="$(cd "$STATE_DIR" && pwd -P)"

copy() { # copy <src> <dst> <mode>
  local src="$1" dst="$2" mode="$3"
  if [ "$(cd "$(dirname "$src")" && pwd -P)/$(basename "$src")" = "$dst" ]; then
    chmod "$mode" "$dst"
    return 0
  fi
  install -m "$mode" "$src" "$dst"
}

echo "==> install to $STATE_DIR"
copy "$SRC_DIR/deploy.sh" "$STATE_DIR/deploy.sh" 0755
copy "$SRC_DIR/webhook.py" "$STATE_DIR/webhook.py" 0755
copy "$SRC_DIR/systemd/namecard-webhook.service" "$UNIT_DIR/namecard-webhook.service" 0644
copy "$SRC_DIR/systemd/namecard-deploy.service" "$UNIT_DIR/namecard-deploy.service" 0644
copy "$SRC_DIR/systemd/namecard-deploy.timer" "$UNIT_DIR/namecard-deploy.timer" 0644

if [ ! -s "$STATE_DIR/webhook.secret" ]; then
  (umask 077 && openssl rand -hex 32 >"$STATE_DIR/webhook.secret")
  echo "==> generated $STATE_DIR/webhook.secret (600)"
else
  echo "==> webhook.secret already exists (kept)"
fi
chmod 600 "$STATE_DIR/webhook.secret"
touch "$STATE_DIR/deploy.log" "$STATE_DIR/webhook.log"

systemctl --user daemon-reload
systemctl --user enable --now namecard-webhook.service
systemctl --user enable --now namecard-deploy.timer

echo "==> status"
systemctl --user --no-pager --lines=5 status namecard-webhook.service || true
systemctl --user --no-pager list-timers namecard-deploy.timer || true

cat <<EOF

外側で必要な設定（このホストの外）:
  1. Cloudflare Tunnel の Public Hostname を追加
       deploy.<domain>  ->  http://localhost:8791
  2. GitHub の Webhook を追加
       Payload URL: https://deploy.<domain>/hook
       Content type: application/json
       Events: push のみ
       Secret: $STATE_DIR/webhook.secret の値（表示しない。必要なときだけ自分で開く）

  GitHub 側の登録を CLI から行う場合:
       gh api repos/<owner>/<repo>/hooks --input hook.json
     （config.secret に上のファイルの値を入れる。値はシェル履歴やログに残さない）
EOF
