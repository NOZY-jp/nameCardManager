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
                db:5432  PostgreSQL 16 + pg_bigm
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
# bedrock: Amazon Bedrock（後払い・画像1枚230トークン固定）
# gemini : Gemini（プリペイド残高が必要）
OCR_PROVIDER=bedrock
OCR_STRICT_FAILURE=false
AWS_REGION=ap-northeast-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_ACCESS_KEY_ID=...           # Bedrock を呼べる IAM ユーザーのキー
AWS_SECRET_ACCESS_KEY=...

# --- Gemini API（OCR_PROVIDER=gemini のときのみ） ---
GEMINI_API_KEY=
```

| 変数 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | DB ユーザー `namecard_user` のパスワード |
| `SECRET_KEY` | JWT 署名鍵 |
| `OCR_PROVIDER` | OCR の実装。`bedrock` / `gemini` / `none`（既定 `gemini`） |
| `OCR_STRICT_FAILURE` | `true` なら OCR 失敗時に 503 を返す。`false` は空の名刺を返す |
| `AWS_REGION` / `BEDROCK_MODEL_ID` | Bedrock のリージョンとモデル（画像入力対応のもの） |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Bedrock を呼ぶ IAM 資格情報（`.env.prod` は 600 で保存） |
| `GEMINI_API_KEY` | `OCR_PROVIDER=gemini` のときのみ使う |
| `NEXT_PUBLIC_API_BASE_URL` | フロントの API ベース。nginx 経由の相対パス `/api/v1`（**ビルド時に埋め込まれる**） |

`NEXT_PUBLIC_API_BASE_URL` はビルド時に埋め込まれるため、変更する場合は `docker compose build` の前に設定する。

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

起動後の構成は `frontend`（`127.0.0.1:3001`→3000）、`backend`（`127.0.0.1:8000`）、`db`（`127.0.0.1:5432`）の3コンテナ。

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
| `5432` | PostgreSQL（Docker） | `127.0.0.1` | DB 内部接続のみ |
| `3000` | — | — | VM 上の別サービスが使用中。使用不可 |
| `8080` | — | — | 別サービス（`smarthome_nozyjp`）が使用中 |
