# NameCard Manager デプロイガイド（Proxmox VM + Tailscale）

本ガイドでは、NameCard Manager アプリケーション（Next.js + FastAPI + PostgreSQL）を Proxmox VM 上にデプロイする手順を説明します。アクセスは Tailscale 経由のみ（パブリックインターネットへの露出なし）。

---

## 目次

1. [前提条件](#前提条件)
2. [アーキテクチャ概要](#アーキテクチャ概要)
3. [Step 1: プロジェクトを VM にクローン](#step-1-プロジェクトを-vm-にクローン)
4. [Step 2: 本番用 docker-compose について](#step-2-本番用-docker-compose-について)
5. [Step 3: 環境変数ファイルの作成](#step-3-環境変数ファイルの作成)
6. [Step 4: NEXT_PUBLIC_API_BASE_URL について](#step-4-next_public_api_base_url-について)
7. [Step 5: nginx 設定の追加](#step-5-nginx-設定の追加)
8. [Step 6: ビルドと起動](#step-6-ビルドと起動)
9. [Step 7: DB マイグレーション](#step-7-db-マイグレーション)
10. [Step 8: 動作確認](#step-8-動作確認)
11. [セキュリティチェックリスト](#セキュリティチェックリスト)
12. [運用コマンドまとめ](#運用コマンドまとめ)
13. [トラブルシューティング](#トラブルシューティング)
14. [開発版との構成比較](#開発版との構成比較)

---

## 前提条件

| 項目 | 状態 |
|------|------|
| Proxmox VM | 稼働中 |
| nginx | インストール済み（既存サービスのポートフォワーディング設定あり） |
| Docker & Docker Compose | インストール済み |
| Tailscale | VM に接続済み（例: `100.x.x.x`） |
| Git | インストール済み |

> **重要: ポート 3000 は使用不可**
>
> この VM ではポート 3000 が別のサービスによって使用されています（`localhost:3000` にバインド済み）。
> そのため、フロントエンド（Next.js）の**ホスト側ポート**は `3001` を使用します。
> コンテナ内部では引き続きポート 3000 で動作し、Docker のポートマッピング（`3001:3000`）で対応しています。

---

## アーキテクチャ概要

```
スマホ/PC (Tailscale) ──→ 100.x.x.x:8080
                              │
                           nginx (リバースプロキシ)
                              │
                ┌─────────────┴──────────────┐
                │                            │
          /api/v1/* ──→ localhost:8000    /* ──→ localhost:3001
          (FastAPI backend)              (Next.js frontend)
                │                            │
                │                     [container: 3000]
              db:5432
           (PostgreSQL)
```

**ポイント:**
- nginx がリバースプロキシとして 1 つのポート（`8080`）で受け、パスに応じてフロントエンド/バックエンドに振り分け
- フロントエンドはホスト側 `3001` → コンテナ内 `3000` にマッピング（ポート 3000 が使用中のため）
- 全てのコンテナポートは `127.0.0.1` にバインド（外部から直接アクセス不可）
- 外部アクセスは nginx 経由のみ

---

## Step 1: プロジェクトを VM にクローン

```bash
# VM にSSH接続
ssh your-vm

# 作業ディレクトリに移動
mkdir -p ~/apps && cd ~/apps

# リポジトリをクローン
git clone <your-repo-url> nameCardManager
cd nameCardManager
```

---

## Step 2: 本番用 docker-compose について

プロジェクトルートに `docker-compose.prod.yml` が用意されています。以下がその内容です：

```yaml
# docker-compose.prod.yml
services:
  frontend:
    build:
      context: ./frontend
      target: runner          # Production stage (standalone build)
    ports:
      - "127.0.0.1:3001:3000" # Host 3001 → Container 3000 (port 3000 is in use on host)
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_BASE_URL=/api/v1   # Relative path via nginx reverse proxy
    depends_on:
      backend:
        condition: service_started
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      target: prod            # Production stage (no --reload)
    ports:
      - "127.0.0.1:8000:8000" # localhost only (accessed via nginx)
    environment:
      - DATABASE_URL=postgresql+psycopg://namecard_user:${POSTGRES_PASSWORD}@db:5432/namecard
      - SECRET_KEY=${SECRET_KEY}
      - ALLOWED_ORIGINS=["http://${TAILSCALE_IP}:8080"]
      - DEBUG=false
      - LOG_LEVEL=INFO
      - LOG_FORMAT=json
      - IMAGE_DIR=/app/uploads/images
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - upload_data:/app/uploads  # Persist uploaded images
    env_file:
      - .env.prod
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    build:
      context: ./docker/postgres
      dockerfile: Dockerfile
    command: postgres -c shared_preload_libraries=pg_bigm
    environment:
      POSTGRES_USER: namecard_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: namecard
    ports:
      - "127.0.0.1:5432:5432"  # localhost only (no external access)
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U namecard_user -d namecard"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  upload_data:
```

### ポートマッピングの説明

| サービス | ホスト側ポート | コンテナ内ポート | 備考 |
|----------|---------------|-----------------|------|
| frontend | `3001` | `3000` | ポート 3000 が別サービスで使用中のため 3001 に変更 |
| backend | `8000` | `8000` | 変更なし |
| db | `5432` | `5432` | 変更なし |

> **なぜコンテナ内は 3000 のままか？**
>
> Next.js standalone の `server.js` はデフォルトでポート 3000 をリッスンします。
> Docker のポートマッピング（`3001:3000`）により、ホスト側の 3001 がコンテナの 3000 に転送されます。
> コンテナ内のアプリケーションを変更する必要はありません。

---

## Step 3: 環境変数ファイルの作成

プロジェクトルートに `.env.prod` を作成します：

```bash
cat > .env.prod << 'EOF'
# --- Tailscale ---
TAILSCALE_IP=100.x.x.x          # あなたのTailscale IPに置き換え

# --- Database ---
POSTGRES_PASSWORD=ここに強力なパスワードを設定

# --- JWT ---
SECRET_KEY=ここに強力なシークレットキーを設定

# --- Gemini API ---
GEMINI_API_KEY=あなたのGemini APIキー
EOF
```

### 強力なシークレットキーの生成方法

```bash
# SECRET_KEY を生成（64文字のランダム文字列）
openssl rand -hex 32

# POSTGRES_PASSWORD を生成
openssl rand -base64 24
```

> **セキュリティ注意:** `.env.prod` は `.gitignore` により Git の追跡対象外です（`.env.*` パターンで除外済み）。
> 万が一追跡されている場合は以下を実行：
> ```bash
> echo ".env.prod" >> .gitignore
> ```

---

## Step 4: NEXT_PUBLIC_API_BASE_URL について

`NEXT_PUBLIC_API_BASE_URL` は Next.js の**ビルド時**に埋め込まれる環境変数です（`NEXT_PUBLIC_` プレフィックスの仕様）。

### 方針: 相対パスを使用

`docker-compose.prod.yml` では `NEXT_PUBLIC_API_BASE_URL=/api/v1` と設定しています。

**動作の流れ:**
1. ブラウザでフロントエンドにアクセス → `http://100.x.x.x:8080`
2. フロントエンドが API リクエスト → `/api/v1/...`（相対パス）
3. ブラウザは `http://100.x.x.x:8080/api/v1/...` にリクエスト
4. nginx が `/api/v1/*` を FastAPI バックエンドに振り分け

**メリット:** IP アドレスやポートの変更があっても Docker イメージの再ビルドは不要。

> **重要:** この環境変数はビルド時に埋め込まれるため、`docker compose build` の**前に**環境変数の設定が必要です。

---

## Step 5: nginx 設定の追加

既存の nginx 設定に新しい `server` ブロックを追加します。

### 設定ファイルの作成

```bash
sudo nano /etc/nginx/sites-available/namecard-manager
```

以下の内容を記述：

```nginx
# /etc/nginx/sites-available/namecard-manager
#
# NameCard Manager - Reverse Proxy Configuration
# Frontend: localhost:3001 (Next.js standalone)
# Backend:  localhost:8000 (FastAPI)

server {
    listen 8080;
    # Tailscale IP のみでリッスンする場合は以下のように指定可能:
    # listen 100.x.x.x:8080;

    server_name _;

    # --- アップロードファイルサイズ上限 ---
    # 名刺画像のアップロードを考慮して 10MB に設定
    client_max_body_size 10M;

    # --- API リクエスト → FastAPI バックエンド ---
    location /api/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # タイムアウト設定（OCR処理など時間がかかるリクエスト用）
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # --- ヘルスチェック → FastAPI ---
    location /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # --- アップロード画像 → FastAPI ---
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # --- その他すべて → Next.js フロントエンド ---
    location / {
        proxy_pass http://127.0.0.1:3001;  # ← ポート 3001（3000 は使用中）
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket サポート
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> **重要: フロントエンドのプロキシ先はポート `3001`**
>
> `location /` の `proxy_pass` は `http://127.0.0.1:3001` です（`3000` ではありません）。
> ポート 3000 は VM 上の別サービスが使用しているため、Docker Compose でフロントエンドを
> ホスト側 3001 にマッピングしています。

### 有効化とテスト

```bash
# シンボリックリンクを作成して有効化
sudo ln -s /etc/nginx/sites-available/namecard-manager /etc/nginx/sites-enabled/

# 設定をテスト（構文エラーがないか確認）
sudo nginx -t

# nginx をリロード（既存サービスに影響なし）
sudo systemctl reload nginx
```

### 既存サービスとの共存

既存のサービスが別のポート（`80`, `443` など）で動いている場合、この設定はポート `8080` を使うので競合しません。同じポートを使う場合は `server_name` やパスで振り分けが必要です。

---

## Step 6: ビルドと起動

```bash
cd ~/apps/nameCardManager

# 本番用イメージをビルド
docker compose -f docker-compose.prod.yml build

# バックグラウンドで起動
docker compose -f docker-compose.prod.yml up -d

# ログを確認（Ctrl+C で終了）
docker compose -f docker-compose.prod.yml logs -f
```

### 起動の確認

```bash
# 全サービスが running になっていることを確認
docker compose -f docker-compose.prod.yml ps
```

期待される出力：
```
NAME                    STATUS
namecard-frontend-1     Up (healthy)
namecard-backend-1      Up
namecard-db-1           Up (healthy)
```

### ポートの確認

```bash
# フロントエンドがポート 3001 でリッスンしていることを確認
ss -tlnp | grep 3001
# 出力例: LISTEN  127.0.0.1:3001  ...

# ポート 3000 が別サービスで使用中であることの確認
ss -tlnp | grep 3000
# 出力例: LISTEN  127.0.0.1:3000  ... (別サービス)
```

---

## Step 7: DB マイグレーション

初回起動時にデータベースのマイグレーションを実行します：

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

マイグレーションの状態を確認：

```bash
docker compose -f docker-compose.prod.yml exec backend alembic current
```

---

## Step 8: 動作確認

### VM 内から確認

```bash
# 1. ヘルスチェック
curl http://localhost:8080/health
# 期待: {"status":"ok","database":"ok"}

# 2. API 確認（405 が返れば OK — POST のみ受け付けるエンドポイント）
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/auth/login
# 期待: 405

# 3. フロントエンド確認（HTML が返れば OK）
curl -s http://localhost:8080 | head -20

# 4. 直接ポート確認（nginx を経由しない）
curl http://localhost:3001   # フロントエンド（ポート 3001 であることに注意）
curl http://localhost:8000/health  # バックエンド
```

### Tailscale 経由で確認（別のデバイスから）

ブラウザで以下にアクセス：
```
http://100.x.x.x:8080
```

---

## セキュリティチェックリスト

| # | 項目 | 対応方法 | 確認 |
|---|------|----------|------|
| 1 | JWT SECRET_KEY | `openssl rand -hex 32` で強力な値を生成 | Step 3 |
| 2 | DB パスワード | デフォルト `password` → ランダム値に変更 | Step 3 |
| 3 | ポートバインド | 全コンテナ `127.0.0.1` のみ（外部公開防止） | Step 2 |
| 4 | Swagger/ReDoc | `DEBUG=false` で自動無効化 | Step 2 |
| 5 | CORS | Tailscale IP + nginx ポートのみ許可 | Step 2 |
| 6 | `.env.prod` | `.gitignore` で追跡対象外 | Step 3 |
| 7 | Tailscale のみ | パブリック IP への露出なし | 設計上安全 |
| 8 | SSL/TLS | Tailscale が WireGuard でE2E暗号化を提供 → 不要 | 対応不要 |
| 9 | アップロードサイズ | nginx で `client_max_body_size 10M` に制限 | Step 5 |
| 10 | DB 外部アクセス | PostgreSQL ポートは `127.0.0.1:5432` のみ | Step 2 |

---

## 運用コマンドまとめ

### 起動 / 停止 / 再起動

```bash
# 起動
docker compose -f docker-compose.prod.yml up -d

# 停止
docker compose -f docker-compose.prod.yml down

# 再起動
docker compose -f docker-compose.prod.yml restart

# 特定サービスのみ再起動
docker compose -f docker-compose.prod.yml restart frontend
```

### ログ確認

```bash
# 全サービスのログ（リアルタイム）
docker compose -f docker-compose.prod.yml logs -f

# バックエンドのみ
docker compose -f docker-compose.prod.yml logs -f backend

# フロントエンドのみ
docker compose -f docker-compose.prod.yml logs -f frontend

# 最新 100 行のみ
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### アプリケーション更新

```bash
cd ~/apps/nameCardManager

# 最新コードを取得
git pull

# リビルド & 再起動
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# DB マイグレーション（必要な場合）
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### DB バックアップ / リストア

```bash
# バックアップ
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U namecard_user namecard > backup_$(date +%Y%m%d).sql

# リストア
cat backup_YYYYMMDD.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U namecard_user namecard
```

### コンテナの状態確認

```bash
# サービス一覧と状態
docker compose -f docker-compose.prod.yml ps

# リソース使用量
docker compose -f docker-compose.prod.yml top

# ディスク使用量
docker system df
```

---

## トラブルシューティング

### ポート 3001 でフロントエンドにアクセスできない

```bash
# 1. コンテナが起動しているか確認
docker compose -f docker-compose.prod.yml ps frontend
# STATUS が "Up" であること

# 2. ポート 3001 がリッスンされているか確認
ss -tlnp | grep 3001

# 3. コンテナ内でポート 3000 がリッスンされているか確認
docker compose -f docker-compose.prod.yml exec frontend sh -c "wget -qO- http://localhost:3000 | head -5"

# 4. フロントエンドのログを確認
docker compose -f docker-compose.prod.yml logs frontend
```

### ポート競合（3000 が使用中）

もし `docker compose up` 時に以下のようなエラーが出た場合：
```
Error: bind: address already in use
```

ポートマッピングが `3001:3000` になっていることを確認してください：
```bash
# docker-compose.prod.yml のフロントエンドポート設定を確認
grep -A2 "ports:" docker-compose.prod.yml | head -6
# "127.0.0.1:3001:3000" であること
```

### フロントエンドから API にアクセスできない

1. **CORS エラー**: `ALLOWED_ORIGINS` にフロントエンドのオリジン（`http://100.x.x.x:8080`）が含まれているか確認
2. **nginx 設定**: `location /api/v1/` の `proxy_pass` が `http://127.0.0.1:8000` を指しているか確認
3. **コンテナの状態**: `docker compose -f docker-compose.prod.yml ps` で全サービスが running か確認

```bash
# nginx 設定のテスト
sudo nginx -t

# バックエンドへの直接アクセスを確認
curl http://localhost:8000/health
```

### ビルドに失敗する

```bash
# キャッシュなしでリビルド
docker compose -f docker-compose.prod.yml build --no-cache

# 特定サービスのみリビルド
docker compose -f docker-compose.prod.yml build frontend
docker compose -f docker-compose.prod.yml build backend
```

### DB に接続できない

```bash
# DB コンテナの状態を確認
docker compose -f docker-compose.prod.yml ps db
# healthy になるまで待つ（最大 50 秒）

# DB に直接接続
docker compose -f docker-compose.prod.yml exec db psql -U namecard_user -d namecard

# DB ログを確認
docker compose -f docker-compose.prod.yml logs db
```

### Tailscale 経由でアクセスできない

```bash
# VM の Tailscale 状態を確認
tailscale status

# ファイアウォールでポート 8080 が許可されているか確認
sudo ufw status          # ufw の場合
sudo iptables -L -n      # iptables の場合

# 必要に応じてポートを開放（ufw の場合、Tailscale 範囲のみ許可）
sudo ufw allow from 100.64.0.0/10 to any port 8080
```

### 画像アップロードが失敗する

```bash
# nginx の client_max_body_size を確認
sudo nginx -T | grep client_max_body_size
# 10M であること

# アップロードディレクトリの確認
docker compose -f docker-compose.prod.yml exec backend ls -la /app/uploads/images/

# ボリュームが正しくマウントされているか確認
docker volume ls | grep upload
```

---

## 開発版との構成比較

| 項目 | 開発版 (`docker-compose.yml`) | 本番版 (`docker-compose.prod.yml`) |
|------|------|------|
| frontend target | `dev` (next dev) | `runner` (standalone server.js) |
| frontend ホスト側ポート | `3000` | **`3001`** (3000 使用不可) |
| backend target | `dev` (--reload あり) | `prod` (--reload なし) |
| ポートバインド | `0.0.0.0` (全インターフェース) | `127.0.0.1` (ローカルのみ) |
| develop.watch | あり（ホットリロード） | なし |
| DB 認証情報 | ハードコード (`user/password`) | 環境変数参照 (`${POSTGRES_PASSWORD}`) |
| DB ユーザー名 | `user` | `namecard_user` |
| restart policy | なし | `unless-stopped` |
| upload volume | なし | `upload_data`（画像永続化） |
| CORS | 制限なし | Tailscale IP のみ許可 |
| Swagger UI | 有効 | `DEBUG=false` で無効 |
| ログ形式 | テキスト | JSON |

---

## クイックリファレンス: ポート一覧

| ポート | サービス | バインド先 | 備考 |
|--------|----------|-----------|------|
| `8080` | nginx (外部向け) | `0.0.0.0` or Tailscale IP | ブラウザからアクセスするポート |
| `3001` | frontend (Docker) | `127.0.0.1` | nginx → frontend への内部転送 |
| `8000` | backend (Docker) | `127.0.0.1` | nginx → backend への内部転送 |
| `5432` | PostgreSQL (Docker) | `127.0.0.1` | DB への内部接続のみ |
| `3000` | **使用不可** | — | 別サービスが使用中 |
