# 認証（Phase 2: Auth.js + JWT Cookie）

Next.js 側の認証実装。Phase 6 まで FastAPI は並行稼働し、`/api/v1/auth/*` の契約は既存 API と互換にする。

## 構成

| 項目 | 実装 |
| --- | --- |
| ライブラリ | Auth.js（NextAuth v5）Credentials プロバイダ |
| セッション | JWT Cookie（DB セッションは使わない） |
| パスワード | bcryptjs（既存の `$2b$12$` をそのまま検証。登録時は cost 12 でハッシュ化） |
| ユーザー | 既存 `users` テーブルをそのまま使用（連携・移行なし） |
| ルート | `POST /api/v1/auth/register` / `login` / `logout`、`GET /api/v1/auth/me` |
| 認可 | `src/lib/auth/guard.ts` の `getCurrentUser()` に集約。未ログインは 401 `{"detail":"Not authenticated"}` |

Cookie 属性（`src/lib/auth/config.ts`）:

| 属性 | 値 |
| --- | --- |
| 名前 | `authjs.session-token`（本番は `__Secure-authjs.session-token`） |
| HttpOnly | 常に true |
| SameSite | `lax` |
| Secure | `NODE_ENV=production` のときだけ |
| Path | `/` |
| 有効期限 | `AUTH_SESSION_MAX_AGE_DAYS`（既定 30 日） |

## 環境変数（値は置かない）

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | 既存 PostgreSQL（postgres.js 用の表記） |
| `AUTH_SECRET` | Auth.js（セッション Cookie）の署名鍵。`SECRET_KEY` とは**別物**（`openssl rand -hex 32` など） |
| `AUTH_SESSION_MAX_AGE_DAYS` | セッション Cookie の有効日数（既定 30） |
| `SECRET_KEY` | 旧 FastAPI JWT（HS256）の署名鍵。FastAPI と**同じ値**を共用し、本文 `access_token` の発行・旧JWT の検証に使う |
| `JWT_EXPIRE_MINUTES` | 本文 `access_token` の有効分数（既定 60） |
| `LEGACY_JWT_SWITCH_DATE` | 切替日（`YYYY-MM-DD`）。未設定なら旧 JWT を受理しない |
| `LEGACY_JWT_GRACE_DAYS` | 互換期間の日数（既定 14） |

## 旧 JWT の互換（Phase 6）

切替日から `LEGACY_JWT_GRACE_DAYS` 日間だけ、旧 FastAPI が発行した HS256 JWT を受理する。
トークンは Cookie `access_token` または `Authorization: Bearer` から読む。

- 既定（`LEGACY_JWT_SWITCH_DATE` 未設定）は**互換期間は未開始**で、旧 JWT はすべて 401。
- Phase 6 の切替日に `LEGACY_JWT_SWITCH_DATE=YYYY-MM-DD` と `SECRET_KEY`（旧 FastAPI と同じ値）を設定して有効化する。
- 期限後は 401。利用者には再ログインを案内する（新しい Cookie セッションに置き換わる）。
- ログイン応答の `access_token`（旧形式 HS256）はクライアントが保持する前提で、**サーバー側では失効できない**（`logout` はセッション Cookie を消すだけ）。移行期間が終わったらクライアントから破棄する。
- `SECRET_KEY` が未設定のとき、`login` はセッショントークンを代わりに返さず **500** で失敗する（本文にセッショントークンを出さない）。

### 移行手順（Phase 6 当日）

1. 旧 FastAPI の `SECRET_KEY` と同じ値を、Next 側の `SECRET_KEY` に入れる（値はサーバーの env のみ。`AUTH_SECRET` とは別物）。
2. `LEGACY_JWT_SWITCH_DATE` を切替日に設定し、`LEGACY_JWT_GRACE_DAYS=14`（既定）で起動する。
3. nginx の `/api/` を Next へ向ける。旧 JWT の利用者はそのまま 14 日間使える。
4. 14 日後に `LEGACY_JWT_SWITCH_DATE` を外す（または期限経過で自動的に 401）。案内済みの利用者は再ログインする。

## API の互換

| 既存 FastAPI | 新実装 | 備考 |
| --- | --- | --- |
| `POST /register` → 201 `{id,email,created_at}` | 同じ | 重複は 409 `Email already registered` |
| `POST /login` → `{access_token,token_type}` | 同じ | 併せて httpOnly Cookie を発行。`access_token` は旧形式（HS256, `SECRET_KEY`）で、セッション Cookie の Auth.js トークンとは別物 |
| `GET /me` → `{id,email,created_at}` | 同じ | セッション Cookie または旧 JWT |
| （なし） | `POST /logout` → 204 | Cookie を破棄 |

## 検証

```bash
cd frontend
pnpm exec vitest --run          # 単体（bcrypt・旧JWT・Cookie属性・401）
pnpm exec tsc --noEmit
pnpm build

# E2E（隔離 DB・AUTH_SECRET・旧JWT用の SECRET_KEY が必要。値はダミー）
DATABASE_URL=... AUTH_SECRET=dummy SECRET_KEY=dummy   LEGACY_JWT_SWITCH_DATE=$(date +%F)   pnpm exec playwright test e2e/auth-api.spec.ts
```

E2E は CI には入れていない（PostgreSQL の起動が必要なため）。Phase 3 以降で CI 用の DB サービスを用意したときに組み込む。
