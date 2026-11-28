# NameCard Manager デプロイガイド（Proxmox VM + Cloudflare Tunnel）

本ガイドは、NameCard Manager（現行構成: Next.js + FastAPI + PostgreSQL）の本番環境の実態と手順をまとめたものです。
アクセスは **Cloudflare Tunnel（`cloudflared`）経由**で、オリジンは nginx の `:80` です。Tailscale を前提とした構成は廃止しました（2026-11-27 更新）。

> 2026-11-27 時点の実機確認に基づく。今後 Next.js 単一アプリ（TypeScript バックエンド）へ刷新する予定で、刷新後の手順は `docs/plans/nextjs-fullstack-rebuild.md` を正とする。

---

## 目次

1. [構成の実態](#構成の実態)
2. [前提条件](#前提条件)
3. [環境変数](#環境変数)
4. [nginx 設定](#nginx-設定)
5. [ビルドと起動](#ビルドと起動)
6. [自動デプロイ（CD）](#自動デプロイcd)
6. [DB マイグレーション](#db-マイグレーション)
7. [動作確認](#動作確認)
8. [セキュリティ](#セキュリティ)
9. [運用コマンド](#運用コマンド)
10. [トラブルシューティング](#トラブルシューティング)
11. [ポート一覧](#ポート一覧)

---

## 構成の実態

| 項目 | 値 |
| --- | --- |
| ホスト | `nozyjp-server`（Proxmox VM、SSH ユーザー `nozyjp`。手元からは `ssh nozyjp`） |
| 配置 | `/home/nozyjp/nameCardManager`（本番は `main` のコミットを detached HEAD でチェックアウト） |
| Compose | リポジトリ直下の `docker-compose.yml`（本番用の別ファイルは持たない） |
| 前段 | `cloudflared.service`（トークン方式の Cloudflare Tunnel）→ nginx `:80` |
| 公開 URL | `https://name.nozyjp.com`（TLS 終端は Cloudflare。オリジンは HTTP） |
| 環境変数 | リポジトリ直下の `.env.prod`（Git 管理外） |

```
ブラウザ（インターネット）
   │ HTTPS
Cloudflare Edge
   │ Cloudflare Tunnel（cloudflared.service）
nozyjp-server :80  nginx（server_name name.nozyjp.com）
   ├── /api/  → 127.0.0.1:8000  FastAPI
   └── /     → 127.0.0.1:3001  Next.js（コンテナ内 3000）
                  │
   backend ──┬── db:5432   PostgreSQL 16 + pg_bigm
             └── ocr:8100  NDLOCR-Lite（日本語・縦書き対応、CPU、無料）
```

- 全コンテナのポートは `127.0.0.1` にバインドし、外部からは直接到達できない。
- VM 上のポート `3000` は別サービスが使用中のため、フロントはホスト側 `3001` にマッピングする。
- オリジンに TLS 証明書は置かない（Cloudflare が終端する）。証明書を VM 側で管理する構成へ変える場合は nginx とトンネル設定の両方の変更が必要。

---

## 前提条件

| 項目 | 状態 |
| --- | --- |
| Proxmox VM | 稼働中（`nozyjp-server`） |
| nginx | インストール済み。他のドメインと同居 |
| Docker / Docker Compose | インストール済み |
| Cloudflare Tunnel | `cloudflared.service` が稼働中。`name.nozyjp.com` を nginx に向ける |
| Git | インストール済み（`origin` は GitHub の SSH URL） |

> **重要: ポート 3000 は使用不可**
> この VM ではポート 3000 が別サービスによって使用されています。フロントエンドのホスト側ポートは `3001`（`3001:3000`）を使います。

---

## 環境変数

リポジトリ直下に `.env.prod` を置く（`.gitignore` の `.env.*` で追跡対象外）。

```bash
# --- Database ---
POSTGRES_PASSWORD=...            # openssl rand -base64 24

# --- JWT ---
SECRET_KEY=...                   # openssl rand -hex 32

# --- OCR（プロバイダ切替） ---
# ndl    : 自前の ocr-service（NDLOCR-Lite）。無料・縦書き対応・画像は外部に出ない
# bedrock: Amazon Bedrock（後払い・画像1枚230トークン固定）
# gemini : Gemini（プリペイド残高が必要）
OCR_PROVIDER=ndl
OCR_SERVICE_URL=http://ocr:8100
OCR_STRICT_FAILURE=false
AWS_REGION=ap-northeast-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_ACCESS_KEY_ID=...           # Bedrock を呼べる IAM ユーザーのキー
AWS_SECRET_ACCESS_KEY=...

# --- Vertex AI（OCR_PROVIDER=vertex。Google Cloud の後払い） ---
VERTEX_PROJECT=fluid-crane-482105-s3
VERTEX_LOCATION=global
VERTEX_MODEL=gemini-3.1-flash-lite
# サービスアカウント鍵は secrets/vertex-sa.json に置く（compose が :ro でマウントする）

# --- Gemini API（OCR_PROVIDER=gemini のときのみ） ---
GEMINI_API_KEY=
```

| 変数 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | DB ユーザー `namecard_user` のパスワード |
| `SECRET_KEY` | JWT 署名鍵 |
| `OCR_PROVIDER` | OCR の実装。`vertex`（本番） / `ndl` / `bedrock` / `gemini` / `none`（compose の既定は `ndl`） |
| `OCR_SERVICE_URL` | `OCR_PROVIDER=ndl` のときの OCR サービス（既定 `http://ocr:8100`） |
| `VERTEX_PROJECT` / `VERTEX_LOCATION` / `VERTEX_MODEL` | `OCR_PROVIDER=vertex` のときの Vertex AI 設定（既定 `global` / `gemini-3.1-flash-lite`） |
| `OCR_STRICT_FAILURE` | `true` なら OCR 失敗時に 503 を返す。`false` は空の名刺を返す |
| `AWS_REGION` / `BEDROCK_MODEL_ID` | Bedrock のリージョンとモデル（画像入力対応のもの） |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Bedrock を呼ぶ IAM 資格情報（`.env.prod` は 600 で保存） |
| `GEMINI_API_KEY` | `OCR_PROVIDER=gemini` のときのみ使う |
| `NEXT_PUBLIC_API_BASE_URL` | フロントの API ベース。nginx 経由の相対パス `/api/v1`（**ビルド時に埋め込まれる**） |

`NEXT_PUBLIC_API_BASE_URL` はビルド時に埋め込まれるため、変更する場合は `docker compose build` の前に設定する。

> **`.env` と `.env.prod` の使い分け**
> `docker compose` の `${VAR}` 展開はプロジェクト直下の `.env` を読む。`env_file: .env.prod` はコンテナ内の環境変数用で、`environment:` の値が優先される。そのため OCR の切替値は両方に同じ内容を置く。`.env` には `POSTGRES_PASSWORD` と `SECRET_KEY` も必要（`DATABASE_URL` の組み立てに使う）。どちらも Git 管理外・600。

---

## nginx 設定

`/etc/nginx/sites-available/name_nozyjp`（`sites-enabled` にシンボリックリンク済み）。

```nginx
server {
    listen 80;
    server_name name.nozyjp.com;

    client_max_body_size 10M;   # 名刺画像のアップロードを考慮

    # API → FastAPI（/api/v1 を含むパスをそのまま転送）
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # OCR など時間のかかるリクエスト用
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # フロントエンド → Next.js
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

設定変更時は `sudo nginx -t && sudo systemctl reload nginx`。Cloudflare 側のホスト名とトンネルのルーティングはダッシュボード側の設定が正で、リポジトリには保存していない。

---

## 刷新中の新旧同居（Phase 6 まで）

Next.js 単一アプリへの刷新（`docs/plans/nextjs-fullstack-rebuild.md`）は Phase 6 まで、現行の FastAPI と新しい Next サーバー実装が**同じ DB・同じホストで並行稼働**する。Phase 6 の切り替えは **nginx の upstream（`/api/` の転送先）を新実装へ向け直すだけ**で行い、DB や Cloudflare Tunnel は変更しない。切り替え後も旧 FastAPI イメージは1か月残し、問題があれば nginx を戻してロールバックする。

### 構成とポート

| 役割 | 現行（Phase 0〜5） | 移行中（Phase 2〜5 は並行） | Phase 7 以降 |
| --- | --- | --- | --- |
| 画面 | `frontend`（Next.js、ホスト `3001` → コンテナ `3000`） | 同じ `frontend` | `app` に統合 |
| API | `backend`（FastAPI、ホスト `8000`）、`/api/v1/*` の転送先 | 新実装の Route Handlers と FastAPI が**並行稼働** | `app`（Next.js、`3001`→`3000`） |
| DB | `db`（PostgreSQL 16 + pg_bigm、`5432`） | 同じ DB を共用（テーブル・ID は変更しない） | 同じ |
| OCR サービス | `ocr`（NDLOCR-Lite、`8100`） | 同じ（本番 OCR は Vertex AI） | 削除 |
| 切替方法 | — | **Phase 6 で nginx の `/api/` 転送先を新実装へ変えるだけ**（DB・Tunnel・DNS は変更しない） | — |

サービス名は Phase 7 で `backend` → `app` に改名する予定（ホスト側ポートは `3001` のまま）。

### 環境変数の対応（変数名と公開設定値のみ）

この表には変数名と公開設定値だけを書き、接続文字列の実値・パスワード・鍵・トークン・Webhook Secret は書かない（実値は `secrets/` と `.env*` にだけ置く）。

`.env` / `.env.prod` / `secrets/` は未追跡で、`git reset --hard` でも消えない。新旧で同じ意味の変数を次のように対応させる（変数名と公開設定値の対応表。接続文字列の実値・鍵の中身はリポジトリに置かない）。

| 用途 | 現行 FastAPI | 新 Next.js | 備考 |
| --- | --- | --- | --- |
| DB 接続 | `DATABASE_URL`（`postgresql+psycopg://…`） | `DATABASE_URL`（postgres.js 用にドライバ表記だけ変える） | 同じ DB・同じ認証情報 |
| セッション署名 | `SECRET_KEY` | `AUTH_SECRET` | Auth.js の JWT Cookie 署名（`SECRET_KEY` とは別物） |
| 旧JWT署名 | `SECRET_KEY` | `SECRET_KEY`（共用） | HS256。本文 `access_token` の発行と旧JWTの検証に使う |
| 旧JWTの有効分数 | — | `JWT_EXPIRE_MINUTES` | 既定 60 |
| 旧JWT互換の開始日 | — | `LEGACY_JWT_SWITCH_DATE` | `YYYY-MM-DD`。未設定なら旧JWTを受理しない |
| 旧JWT互換の日数 | — | `LEGACY_JWT_GRACE_DAYS` | 既定 14 |
| セッションCookieの日数 | — | `AUTH_SESSION_MAX_AGE_DAYS` | 既定 30 |
| OCR 切替 | `OCR_PROVIDER=vertex` | `OCR_PROVIDER=vertex` | 同名で引き継ぐ |
| Vertex 設定 | `VERTEX_PROJECT` / `VERTEX_LOCATION` / `VERTEX_MODEL` | 同じ | `gemini-3.1-flash-lite` |
| 画像ディレクトリ | `IMAGE_DIR` | `IMAGE_DIR` | 既存の uploads を共用（webp/サムネイル）。APIのアップロード上限は nginx と同じ 10MB |
| Vertex 認証 | `GOOGLE_APPLICATION_CREDENTIALS`（`secrets/vertex-sa.json` を `:ro` マウント） | 同じ | 鍵はファイルのまま |
| API ベース URL | `NEXT_PUBLIC_API_BASE_URL` | 不要 | 同一オリジンの `/api/v1` へ寄せる |
| OCR サービス | `OCR_SERVICE_URL` | 使わない | Phase 7 で削除 |
| 旧 OCR 経路 | `GEMINI_API_KEY` / `AWS_*` / `BEDROCK_MODEL_ID` | 引き継がない | 本番は Vertex に統一 |

この間も `main` へのマージで `deploy.sh` が動く。`deploy/` の `webhook.py`・`install.sh`・systemd unit はデプロイ時に自動同期される（差分があるときだけ再起動）。`deploy.sh` 自身は実行中の書き換えを避けるため自動更新せず、差分は `deploy.log` の警告にだけ出る。`deploy.sh` を変えたときは `~/nameCardManager/deploy/install.sh` を1回手で実行する。

## ビルドと起動

```bash
ssh nozyjp
cd /home/nozyjp/nameCardManager

# 取得（本番は detached HEAD。ブランチを進める場合は明示的にチェックアウトする）
git fetch origin
git checkout <deploy-commit>

# ビルドと起動
docker compose build
docker compose up -d

# 状態確認
docker compose ps
```

起動後の構成は `frontend`（`127.0.0.1:3001`→3000）、`backend`（`127.0.0.1:8000`）、`ocr`（`127.0.0.1:8100`）、`db`（`127.0.0.1:5432`）の4コンテナ。

## 自動デプロイ（CD）

`main` に push すると、**GitHub webhook → Cloudflare Tunnel → サーバー上の受信サービス**の順に伝わり、自動で本番へ反映される。GitHub の経路から SSH を開けず、sudo も不要。

```
git push origin main
   │
GitHub（webhook: push, HMAC-SHA256 署名）
   │ HTTPS
Cloudflare Tunnel  deploy.nozyjp.com → http://localhost:8791
   │
nozyjp-server  namecard-webhook.service（systemd --user）
   │ 署名検証 → refs/heads/main のみ受理
   └─ ~/namecard-deploy/deploy.sh
        1. CI の完了を待つ（GitHub API・最大 15 分。失敗なら中止）
        2. git reset --hard <sha>（.env / .env.prod / secrets/ は温存）
        3. 対象コミットの deploy/ から webhook.py・install.sh・systemd unit を同期
           （reset 成功時のみ。差分があるときだけ daemon-reload と webhook 再起動。失敗しても継続）
        4. 差分のあるサービスだけ docker compose build
        5. docker compose up -d --no-deps（稼働中＋ビルドしたサービス）
        6. /health とフロントの応答を確認（最大 3 分）
        7. backend を更新したときだけ alembic upgrade head
        8. 失敗したら直前のコミットへ戻して再ビルド（自動ロールバック）
```

| ファイル | 役割 |
| --- | --- |
| `deploy/webhook.py` | 受信（stdlib のみ）。`GET /health`、`POST /hook`。署名不一致は 403 |
| `deploy/deploy.sh` | 反映本体。CI ゲート・差分ビルド・ヘルスチェック・ロールバック |
| `deploy/systemd/` | `namecard-webhook.service`（常駐）、`namecard-deploy.{service,timer}`（1 分おきのフォールバック） |
| `deploy/install.sh` | 初回設置。`~/namecard-deploy/` へ複製し、unit を有効化（**sudo 不要**）。2 回目以降の差分は `deploy.sh` が自動同期する |

### 設置（初回のみ）

```bash
ssh nozyjp
~/nameCardManager/deploy/install.sh      # 初回のみ（sudo 不要）
```

以降、`deploy/webhook.py`・`deploy/install.sh`・`deploy/systemd/` の変更は **`deploy.sh` がデプロイ時に自動で同期**する（同期元は**反映対象コミット**の `deploy/`。checkout 前の古い作業ツリーは読まない。`git reset` が失敗したときは同期せず、設置物だけ新しくなる不整合を残さない）（CRLF は LF に正規化、差分があるときだけ `daemon-reload` と `namecard-webhook.service` の再起動、失敗はログのみでデプロイは継続）。`deploy.sh` 自身だけは実行中スクリプトを書き換えないため自動反映せず、差分を `deploy.log` に警告として出す。`deploy.sh` を更新したときだけ、その 1 回は `~/nameCardManager/deploy/install.sh` を手で実行する。

設置後に必要な外側の設定（このリポジトリには保存しない）:

1. Cloudflare Tunnel の Public Hostname を追加: `deploy.nozyjp.com` → `http://localhost:8791`
2. GitHub の Webhook を追加: Payload URL `https://deploy.nozyjp.com/hook`、Content type `application/json`、イベントは `push` のみ

### 受信の認証方式

二段構えで、どちらかを満たしたものだけを受理する。

| 方式 | 条件 | 設定 |
| --- | --- | --- |
| HMAC 署名 | `X-Hub-Signature-256` が `webhook.secret` と一致 | GitHub の Secret に `~/namecard-deploy/webhook.secret` の値を登録 |
| 送信元 IP | 署名ヘッダが無い場合、`CF-Connecting-IP` が GitHub の webhook 送信元（`api.github.com/meta` の `hooks`）に含まれる | 追加設定不要 |

- 現在の GitHub 側は **Secret 未登録**で、送信元 IP 方式で運用している。HMAC に切り替えるときは、GitHub の Webhook 編集で Secret を入力するだけでよい（コード変更不要）。
- IP レンジは 1 時間キャッシュし、取得に失敗したときは無署名を拒否する（fail closed）。
- どちらの方式でも、ペイロードの `repository.full_name` が一致しないものは 403。
- 2026-11-28: 送信元 IP 方式で GitHub からの `push` を受信し、push から約 2 分（CI 待ち含む）で反映されることを実測。
- 偽の trigger でも本番に入るのは「CI が緑で `origin/main` の祖先」のコミットだけ（`deploy.sh` 側で検証）。

### 運用

```bash
# 実行ログ（デプロイ本体 / 受信）
tail -f ~/namecard-deploy/deploy.log
journalctl --user -u namecard-webhook.service -f

# 最後に成功したコミット
cat ~/namecard-deploy/last-deploy

# 手動でデプロイ（CI を待たない）
SKIP_CI_CHECK=1 ~/namecard-deploy/deploy.sh

# 差分が無くても再ビルド（Dockerfile や依存だけ変えたとき。サービス名のカンマ区切りも可）
FORCE_REBUILD=1 ~/namecard-deploy/deploy.sh
FORCE_REBUILD=backend ~/namecard-deploy/deploy.sh

# 一時停止 / 再開
systemctl --user disable --now namecard-webhook.service namecard-deploy.timer
systemctl --user enable --now namecard-webhook.service namecard-deploy.timer
```

### 注意点

- **`main` への push がそのまま本番反映になる。** 問題があれば revert コミットを push する（それも自動反映される）。
- CI が赤のコミットは反映されない（`ci_state` が `failure` で中止）。CI が動いていないコミットでも `pending` のまま 15 分で中止する。
- `.env` / `.env.prod` / `secrets/` は未追跡なので `git reset --hard` で消えない。**追跡ファイルに秘密値を入れない**前提が崩れると即座に漏れる。
- webhook のシークレットを変えるときは `openssl rand -hex 32 > ~/namecard-deploy/webhook.secret && chmod 600 ...` のあと、GitHub 側の Secret を更新して `systemctl --user restart namecard-webhook.service`。
- 受信ポートは `127.0.0.1:8791` のみ。Cloudflare Tunnel を経由しない経路（nginx）には公開していない。
- webhook が届かなかった場合に備えて **1 分おき**のタイマーが同じ `deploy.sh` を回す（`git fetch` のみで、変更が無ければ即終了）。
- 同じコミットでデプロイに失敗した場合は、30 分間は同じコミットを再試行しない（`failed-deploy` に記録）。
- ロールバックは「PREV への reset 成功・apply（build と up）成功・health OK」が揃ったときだけ `rollback done` とする。reset 失敗時は再ビルドも health check も行わず、apply 失敗時は health check を行わず、どちらも `failed-deploy` を残したまま異常終了する（`rollback reset/apply FAILED; manual action needed`）。
- Docker の古いイメージは自動削除しない。ディスクが逼迫したら `docker image prune` を人の判断で実行する。

### OCR サービス（ocr-service）

`ocr-service/` は NDLOCR-Lite（国立国会図書館製、CC BY 4.0）を CPU で動かす小さな HTTP サービス。画像を受け取り、行単位のテキストだけを返す。項目の切り出し（氏名・会社名・住所）は backend 側の辞書・正規表現が行う。

- イメージサイズは約 1.5GB（モデル 151MB をビルド時に取得する）。初回ビルドは数分かかる。
- 起動直後はモデルの読み込みに 10〜20 秒かかり、その間 `/health` は 503 を返す（`start_period: 120s`）。
- メモリは常駐で約 0.7GB。`friend-gpt-relay` など他の常駐プロセスと同居する前提で、VM の空きメモリ 6GB に対して余裕がある。
- 画像は保存せず、外部へ送らない。`127.0.0.1:8100` のみに公開し、nginx からは公開しない。

```bash
# 単体での動作確認（backend を経由しない）
curl -s http://127.0.0.1:8100/health
curl -s -F "file=@card.png" http://127.0.0.1:8100/ocr | head -c 400

# ログ
docker compose logs -f ocr
```

`OCR_PROVIDER=gemini` に戻せば従来の Gemini 経路で動く（ocr コンテナは起動したままでよい）。

### Vertex AI（後払い）に切り替える

Gemini に画像から直接項目を出させたいときは `OCR_PROVIDER=vertex` にする。画像は Google Cloud へ送信される。

1. プロジェクトで **Agent Platform API（aiplatform.googleapis.com）を有効化**（済み）
2. サービスアカウント `namecard-ocr`（ロール: Agent Platform ユーザー = `roles/aiplatform.user`）の鍵を `secrets/vertex-sa.json` に置く（600、Git 管理外）
3. `.env.prod` に `OCR_PROVIDER=vertex` と `VERTEX_PROJECT` を設定
4. `docker compose up -d --build backend`（backend のみ再ビルド）

- 単価は Gemini API と同額（3.1 Flash-Lite: 入力 $0.25 / 出力 $1.50、100万トークン）。名刺1枚あたり入力約1,700・出力約350トークンで **約14銭/枚**。¥200/月なら約1,400枚。
- 2.5 / 2.0 系は Vertex では提供終了のため 404 になる（既定は 3.1 Flash-Lite）。
- Vertex の上限は Cloud の **spend cap enforcement（強制停止）** で設定済み: 月次 ¥200、対象はプロジェクト「Gemini API」のサービス「Vertex AI」、通知は 50 / 80 / 100%。上限に達すると Vertex が停止し、翌月1日に自動解除される（手動解除も可）。AI Studio の前払い残高やプロジェクト月次上限は Vertex には適用されない。
- 強制停止は即時ではない（「上限より少し低く設定する」よう公式に案内）。超過分は請求される。
- 鍵はコンテナ内 `/app/secrets/vertex-sa.json`（読み取り専用）。鍵を置かずに `OCR_PROVIDER=vertex` にすると認証で失敗する。

---

## DB マイグレーション

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```

スキーマの正本は `docs/dev/db/schema.md`。

---

## 動作確認

```bash
# 1. ヘルスチェック（nginx 経由）
curl -s http://localhost/api/v1/health

# 2. フロントエンド（307 で /login に飛べば OK）
curl -sI http://localhost/

# 3. 直接ポート（nginx を経由しない）
curl -s http://localhost:8000/api/v1/health
curl -s http://localhost:3001 | head -5

# 4. 外部から
curl -sI https://name.nozyjp.com
```

---

## セキュリティ

| 項目 | 対応 |
| --- | --- |
| JWT SECRET_KEY | `openssl rand -hex 32` で生成し `.env.prod` に置く |
| DB パスワード | ランダム値を `.env.prod` に置く |
| ポートバインド | 全コンテナ `127.0.0.1`。外部公開は nginx のみ |
| TLS | Cloudflare が終端。オリジンは HTTP（Cloudflare との間はトンネルで暗号化） |
| アクセス制御 | Cloudflare 側で制御する（Tailscale 前提の閉域構成は廃止） |
| CORS | `ALLOWED_ORIGINS` に公開オリジン（`https://name.nozyjp.com`）のみ許可 |
| Swagger/ReDoc | `DEBUG=false` で無効化 |
| アップロード | nginx `client_max_body_size 10M` |
| `.env.prod` | Git 追跡外 |
| 個人情報 | 名刺は実在の個人情報。バックアップを外部サービスへ置かない |

---

## 運用コマンド

```bash
# 起動 / 停止 / 再起動
docker compose up -d
docker compose down
docker compose restart
docker compose restart frontend

# ログ
docker compose logs -f
docker compose logs --tail=100 backend

# アプリ更新
git fetch origin && git checkout <deploy-commit>
docker compose build && docker compose up -d
docker compose exec backend alembic upgrade head   # 必要な場合

# バックアップ / リストア
docker compose exec -T db pg_dump -U namecard_user namecard > backup_$(date +%Y%m%d).sql
cat backup_YYYYMMDD.sql | docker compose exec -T db psql -U namecard_user namecard

# 状態・リソース
docker compose ps
docker system df
```

> 名刺データを含むバックアップは個人情報。暗号化しないまま共有領域・クラウドへ置かない。

---

## トラブルシューティング

### サイトに到達できない

```bash
# 1. cloudflared が動いているか
systemctl status cloudflared --no-pager

# 2. オリジンの nginx が応答するか
curl -sI http://localhost/

# 3. Cloudflare 側のホスト名・トンネルのルーティング設定（ダッシュボード）
```

### フロントエンドにアクセスできない（502/503）

```bash
docker compose ps frontend
ss -tlnp | grep 3001
docker compose exec frontend sh -c "wget -qO- http://localhost:3000 | head -5"
docker compose logs frontend
```

### ポート競合（`address already in use`）

`docker-compose.yml` のフロントエンドのマッピングが `127.0.0.1:3001:3000` であることを確認する（`3000` は VM 上の別サービスが使用中）。

### フロントエンドから API にアクセスできない

1. `ALLOWED_ORIGINS` に公開オリジンが入っているか
2. nginx の `location /api/` の `proxy_pass` が `http://127.0.0.1:8000` か
3. `docker compose ps` で全サービスが running か

```bash
sudo nginx -t
curl -s http://localhost:8000/api/v1/health
```

### ビルドに失敗する

```bash
docker compose build --no-cache
docker compose build frontend
```

### DB に接続できない

```bash
docker compose ps db        # healthy になるまで待つ
docker compose exec db psql -U namecard_user -d namecard
docker compose logs db
```

### OCR が空になる／`503` が返る

```bash
docker compose ps ocr                      # healthy か（起動直後は preparing）
docker compose logs --tail=50 ocr          # モデル読み込みの失敗はここに出る
curl -s http://127.0.0.1:8100/health       # {"status":"ok","model_loaded":true,...}
docker compose exec backend env | grep OCR_
```

- `OCR_PROVIDER=ndl` なのに `ocr` が unhealthy のとき、`OCR_STRICT_FAILURE=false`（既定）では空の名刺が保存される。原因が見えたら `true` にして 503 を返す。
- 1 枚あたり 1 秒前後で返る。10 秒を超える場合はモデルが再読み込みされている（コンテナ再起動直後）か、CPU が飽和している。

### 画像アップロードが失敗する

```bash
sudo nginx -T | grep client_max_body_size      # 10M か
docker compose exec backend ls -la /app/uploads/images/
docker volume ls | grep upload
```

---

## ポート一覧

| ポート | サービス | バインド先 | 備考 |
| --- | --- | --- | --- |
| `80` | nginx | `0.0.0.0` | cloudflared → nginx。公開 URL のオリジン |
| `3001` | frontend（Docker） | `127.0.0.1` | nginx → frontend（コンテナ内 3000） |
| `8000` | backend（Docker） | `127.0.0.1` | nginx → FastAPI |
| `8100` | ocr（Docker） | `127.0.0.1` | backend → NDLOCR-Lite。外部公開しない |
| `5432` | PostgreSQL（Docker） | `127.0.0.1` | DB 内部接続のみ |
| `3000` | — | — | VM 上の別サービスが使用中。使用不可 |
| `8080` | — | — | 別サービス（`smarthome_nozyjp`）が使用中 |
