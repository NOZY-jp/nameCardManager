#!/usr/bin/env bash
# nozyjp-server 上で 1 回だけ実行する設置スクリプト（sudo 不要）。
#
#   ~/nameCardManager/deploy/install.sh
#
# 行うこと:
#   1. deploy.sh / webhook.py を ~/namecard-deploy/ へ複製（リポジトリの reset で壊れない場所）
#   2. webhook.secret が無ければ生成（600）
#   3. systemd --user の unit を設置し、webhook と 15 分おきのフォールバック poll を有効化
#
# 再実行しても安全（スクリプトの更新反映に使う）。
set -Eeuo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STATE_DIR:-$HOME/namecard-deploy}"
UNIT_DIR="$HOME/.config/systemd/user"

echo "==> install to $STATE_DIR"
mkdir -p "$STATE_DIR" "$UNIT_DIR"

install -m 0755 "$SRC_DIR/deploy.sh" "$STATE_DIR/deploy.sh"
install -m 0755 "$SRC_DIR/webhook.py" "$STATE_DIR/webhook.py"
install -m 0644 "$SRC_DIR/systemd/namecard-webhook.service" "$UNIT_DIR/namecard-webhook.service"
install -m 0644 "$SRC_DIR/systemd/namecard-deploy.service" "$UNIT_DIR/namecard-deploy.service"
install -m 0644 "$SRC_DIR/systemd/namecard-deploy.timer" "$UNIT_DIR/namecard-deploy.timer"

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

次に必要な設定（このホストの外側）:
  1. Cloudflare Tunnel の Public Hostname を追加
       deploy.<domain>  ->  http://localhost:8791
  2. GitHub の Webhook を追加
       Payload URL: https://deploy.<domain>/hook
       Content type: application/json
       Events: push のみ
       Secret: $STATE_DIR/webhook.secret の値（表示しない。必要なときは自分で開く）

  GitHub 側の登録をスクリプトから行う場合:
       gh api repos/<owner>/<repo>/hooks --input hook.json
     （hook.json の config.secret に上のファイルの値を入れる。値は履歴に残さない）
EOF
