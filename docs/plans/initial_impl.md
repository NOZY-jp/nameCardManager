# 初期実装状況ドキュメント

> 作成日: 2026-02-28
> 対象: nameCardManager バックエンド + インフラ
> 技術スタック: FastAPI (Python 3.14) + PostgreSQL 16 + Next.js + **shadcn/ui** + **SCSS**（⚠️ Tailwind 不使用）
> 関連: [Phase 構成計画](./namecard_manager.md) / [設計意思決定](./design_decisions.md)

---

## 目次

1. [Core モジュール](#1-core-モジュール)
   - [config.py](#11-configpy)
   - [database.py](#12-databasepy)
   - [auth.py](#13-authpy)
2. [Models](#2-models)
3. [Schemas](#3-schemas)
4. [API](#4-api)
   - [deps.py](#41-depspy)
   - [endpoints/auth.py](#42-endpointsauthpy)
   - [endpoints/images.py](#43-endpointsimagespy)
   - [endpoints/namecards.py](#44-endpointsnamecardsspy)
   - [endpoints/search.py](#45-endpointssearchpy)
   - [api.py](#46-apipy)
5. [Main](#5-main)
6. [Infrastructure](#6-infrastructure)
7. [Documentation](#7-documentation)
8. [全体の実装状況サマリ](#8-全体の実装状況サマリ)

---

## 横断的な決定事項（実装時の制約）

> **詳細は [設計意思決定](./design_decisions.md) を参照。**

| 項目 | 決定 | 影響範囲 |
|---|---|---|
| **デプロイ** | VPS（自前管理） | Infrastructure |
| **CI/CD** | GitHub Actions（Phase 1 から）、パブリックリポジトリ | 全体 |
| **Python** | 3.14（CI は Docker コンテナ） | Backend |
| **⚠️ テスト戦略** | **テストファースト** — テストを先に完成させ、テストが通るように実装する。テスト改変はユーザー確認必須 | 全体 |
| **UI コンポーネント** | **shadcn/ui** | Frontend |
| **スタイリング** | **SCSS**（🚫 **Tailwind は絶対に使用しない**） | Frontend |
| **ダークモード** | 対応する | Frontend |
| **API 設計** | 序盤にがちがちに設計 | Backend / Frontend |
| **エラーメッセージ** | ユーザー向けは日本語 | Backend / Frontend |
| **国際化** | 日本語のみ | Frontend |
| **画像制限** | アップロード最大 20MB | Backend |
| **名刺上限** | 制限なし | Backend |

---

## 1. Core モジュール

### 1.1 config.py

- **ファイルパス**: `backend/app/core/config.py`
- **目的・責務**: アプリケーション全体の設定を環境変数 / `.env` ファイルから読み込む。`pydantic-settings` の `BaseSettings` を利用。

#### 実装されている内容

**`Settings` クラス** (`BaseSettings` 継承):

| フィールド | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `app_name` | `str` | `"NameCard Manager"` | アプリケーション名 |
| `debug` | `bool` | `False` | デバッグモード |
| `database_url` | `str` | `"postgresql://user:password@db:5432/myapp"` | PostgreSQL 接続 URL |
| `log_level` | `str` | `"INFO"` | ログレベル |
| `log_format` | `str` | `"text"` | ログ形式 (`text` or `json`) |
| `secret_key` | `str` | `"change-me-in-production"` | JWT 署名用シークレットキー |
| `jwt_algorithm` | `str` | `"HS256"` | JWT アルゴリズム |
| `jwt_expire_minutes` | `int` | `60` | JWT 有効期限（分） |
| `allowed_origins` | `list[str]` | `["http://localhost:3000"]` | CORS 許可オリジン |

```python
model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

**`get_settings()` 関数**:
- `@lru_cache(maxsize=1)` でシングルトンパターンを実現
- `Settings` インスタンスを 1 回だけ生成して返す

#### 依存関係

- `pydantic` (`Field`)
- `pydantic_settings` (`BaseSettings`)

#### 未実装・TODO

- なし（完成済み）

---

### 1.2 database.py

- **ファイルパス**: `backend/app/core/database.py`
- **目的・責務**: SQLAlchemy のエンジン・セッション管理。全モデルの基底クラス `Base` を定義。

#### 実装されている内容

**`Base` クラス** (`DeclarativeBase` 継承):
- 全 ORM モデルの基底クラス

**`get_engine()` 関数**:
- `@lru_cache(maxsize=1)` でシングルトン
- `create_engine()` のオプション:
  - `pool_pre_ping=True` — 接続の有効性を事前確認
  - `pool_size=5` — コネクションプールサイズ
  - `max_overflow=10` — プール超過時の最大追加接続数

```python
@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
```

**`get_session_local()` 関数**:
- `@lru_cache(maxsize=1)` でシングルトン
- `sessionmaker` を返す（`autocommit=False`, `autoflush=False`）

**`get_db()` ジェネレーター関数**:
- FastAPI の `Depends` 用セッションジェネレーター
- リクエストスコープでセッションを管理（`try/finally` で `close()` を保証）

#### 依存関係

- `app.core.config.get_settings` — DB 接続 URL の取得
- `sqlalchemy` (`Engine`, `create_engine`, `DeclarativeBase`, `Session`, `sessionmaker`)

#### 未実装・TODO

- なし（完成済み）

---

### 1.3 auth.py

- **ファイルパス**: `backend/app/core/auth.py`
- **目的・責務**: JWT 発行・検証、パスワードハッシュ化、FastAPI 認証依存性の提供。

#### 実装されている内容

**モジュールレベル変数**:
- `security = HTTPBearer(auto_error=False)` — 未認証時に 403 ではなく 401 を返すための手動制御
- `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")` — bcrypt ハッシュコンテキスト

**パスワード関連関数**:

| 関数 | シグネチャ | 説明 |
|---|---|---|
| `get_password_hash` | `(password: str) -> str` | パスワードを bcrypt でハッシュ化 |
| `verify_password` | `(plain_password: str, hashed_password: str) -> bool` | 平文とハッシュを比較検証 |

**JWT 関連関数**:

| 関数 | シグネチャ | 説明 |
|---|---|---|
| `create_access_token` | `(data: dict[str, object]) -> str` | JWT アクセストークンを発行（HS256） |
| `verify_token` | `(token: str) -> dict[str, object]` | JWT を検証してペイロードを返す |

```python
def create_access_token(data: dict[str, object]) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    return encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)
```

**FastAPI 依存性関数**:

**`get_current_user(credentials)`**:
- `Annotated[HTTPAuthorizationCredentials | None, Depends(security)]` を受け取る
- `credentials` が `None` → 401 `"Not authenticated"`
- `verify_token()` でペイロードを取得 → `sub` (user_id) と `email` を抽出
- `sub` が欠落 → 401 `"Missing user id in token"`
- `ExpiredSignatureError` → 401 `"Token has expired"`
- `DecodeError` → 401 `"Invalid token"`（ログ出力付き）
- 成功時: `CurrentUser(id=int(user_id), email=str(email))` を返す

#### 依存関係

- `app.core.config.get_settings` — JWT 設定値
- `app.schemas.CurrentUser` — 認証済みユーザースキーマ
- `jwt` (`encode`, `decode`, `DecodeError`, `ExpiredSignatureError`)
- `passlib.context.CryptContext`
- `fastapi.security.HTTPBearer`, `HTTPAuthorizationCredentials`

#### 未実装・TODO

- なし（完成済み）

---

## 2. Models

- **ファイルパス**: `backend/app/models/__init__.py`
- **目的・責務**: SQLAlchemy ORM モデル定義。7 テーブル分のモデルを 1 ファイルで管理。

> **⚠️ 2026-02-28 モデル改訂**: Relationship を「組織情報の階層構造」として再定義し、NameCard との関係を 1:N → M:N に変更。NameCard から `email`, `phone`, `company_name`, `department`, `position`, `relationship_id` を削除し、`ContactMethod` テーブルと `NameCardRelationship` 中間テーブルを追加。出会い情報は `met_notes` のみ（フリー入力）。OCR エンジンは Gemini 2.5 Flash を Phase 1 から採用。画像処理はフロント四隅選択UI（SVG overlay）+ バックエンド OpenCV 遠近補正 + カメラガイド枠。検索は pg_bigm を Phase 1 から導入。エクスポートは CSV（Phase 1）、vCard（将来）。フロントエンドは Next.js。

#### 実装されている内容

##### `User` モデル（テーブル: `users`）

| カラム | 型 | 制約 |
|---|---|---|
| `id` | `Integer` | PK, AUTO INCREMENT |
| `email` | `String(255)` | UNIQUE, NOT NULL |
| `password_hash` | `String(255)` | NOT NULL |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True)` | `server_default=func.now()`, `onupdate=func.now()` |

**リレーション**:
- `name_cards` → `NameCard` (1:N, cascade `all, delete-orphan`)
- `relationships` → `Relationship` (1:N, cascade `all, delete-orphan`, `foreign_keys` 指定)
- `tags` → `Tag` (1:N, cascade `all, delete-orphan`)

##### `Relationship` モデル（テーブル: `relationships`）— 組織情報の階層構造

| カラム | 型 | 制約 |
|---|---|---|
| `id` | `Integer` | PK, AUTO INCREMENT |
| `user_id` | `Integer` | FK → `users.id`, NOT NULL |
| `parent_id` | `Integer` | FK → `relationships.id`, NULLABLE |
| `name` | `String(100)` | NOT NULL |

**リレーション**:
- `user` → `User` (N:1)
- `parent` → `Relationship` (N:1, 自己参照, `remote_side`)
- `children` → `Relationship` (1:N, 自己参照)
- `name_cards` → `NameCard` (**M:N**, `secondary="name_card_relationships"`)

**インスタンスメソッド**:

| メソッド | シグネチャ | 説明 |
|---|---|---|
| `get_ancestors` | `(db: Session) -> list[Relationship]` | 再帰 CTE で全祖先を取得（近い順） |
| `get_full_path` | `(db: Session) -> str` | `"建築士会/桑名支部/青年会長"` 形式のフルパスを返す |
| `get_descendants` | `(db: Session) -> list[Relationship]` | 再帰 CTE で全子孫を取得（深さ優先順） |

##### `Tag` モデル（テーブル: `tags`）— フラット分類ラベル

| カラム | 型 | 制約 |
|---|---|---|
| `id` | `Integer` | PK, AUTO INCREMENT |
| `user_id` | `Integer` | FK → `users.id`, NOT NULL |
| `name` | `String(100)` | NOT NULL |

**リレーション**:
- `user` → `User` (N:1)
- `name_cards` → `NameCard` (M:N, `secondary="name_card_tags"`)

##### `NameCardRelationship` モデル（テーブル: `name_card_relationships`）— 中間テーブル（名刺 ↔ 組織の M:N）

| カラム | 型 | 制約 |
|---|---|---|
| `name_card_id` | `Integer` | PK, FK → `name_cards.id` |
| `relationship_id` | `Integer` | PK, FK → `relationships.id` |

複合主キー: `(name_card_id, relationship_id)`

##### `NameCardTag` モデル（テーブル: `name_card_tags`）— 中間テーブル（名刺 ↔ タグの M:N）

| カラム | 型 | 制約 |
|---|---|---|
| `name_card_id` | `Integer` | PK, FK → `name_cards.id` |
| `tag_id` | `Integer` | PK, FK → `tags.id` |

複合主キー: `(name_card_id, tag_id)`

##### `ContactMethod` モデル（テーブル: `contact_methods`）— 連絡先

| カラム | 型 | 制約 |
|---|---|---|
| `id` | `Integer` | PK, AUTO INCREMENT |
| `name_card_id` | `Integer` | FK → `name_cards.id`, NOT NULL |
| `type` | `String(20)` | NOT NULL（`email`, `phone`, `fax`, `website` 等） |
| `label` | `String(50)` | NOT NULL（`仕事`, `携帯`, `自宅` 等） |
| `value` | `String(255)` | NOT NULL |
| `is_primary` | `Boolean` | `default=False` |

**リレーション**:
- `name_card` → `NameCard` (N:1)

##### `NameCard` モデル（テーブル: `name_cards`）

| カラム | 型 | 制約 |
|---|---|---|
| `id` | `Integer` | PK, AUTO INCREMENT |
| `user_id` | `Integer` | FK → `users.id`, NOT NULL |
| `first_name` | `String(100)` | NOT NULL |
| `last_name` | `String(100)` | NOT NULL |
| `first_name_kana` | `String(100)` | NULLABLE |
| `last_name_kana` | `String(100)` | NULLABLE |
| `image_path` | `String(500)` | NULLABLE |
| `met_notes` | `Text` | NULLABLE, comment="どこで出会ったか" |
| `notes` | `Text` | NULLABLE |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True)` | `server_default=func.now()`, `onupdate=func.now()` |

**リレーション**:
- `user` → `User` (N:1)
- `relationships` → `Relationship` (**M:N**, `secondary="name_card_relationships"`)
- `tags` → `Tag` (M:N, `secondary="name_card_tags"`)
- `contact_methods` → `ContactMethod` (1:N, cascade `all, delete-orphan`)

**エクスポート**: `__all__ = ["User", "NameCard", "Relationship", "Tag", "NameCardTag", "NameCardRelationship", "ContactMethod"]`

#### 依存関係

- `app.core.database.Base` — 基底クラス
- `sqlalchemy` (各種型、`func`, `select`, `ForeignKey`, `relationship`)

#### 未実装・TODO

- なし（モデル定義は完成済み）

---

## 3. Schemas

- **ファイルパス**: `backend/app/schemas/__init__.py`
- **目的・責務**: Pydantic スキーマ定義。API のリクエスト / レスポンスの型を定義。

#### 実装されている内容

| スキーマ | 用途 | フィールド |
|---|---|---|
| `CurrentUser` | 認証依存性から返されるユーザー情報（内部用） | `id: int`, `email: str` |
| `UserCreate` | ユーザー登録リクエスト | `email: EmailStr`, `password: str` |
| `UserLogin` | ログインリクエスト | `email: EmailStr`, `password: str` |
| `Token` | JWT トークンレスポンス | `access_token: str`, `token_type: str = "bearer"` |
| `UserResponse` | ユーザー情報レスポンス | `id: int`, `email: str`, `created_at: datetime` |

```python
class CurrentUser(BaseModel):
    id: int
    email: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime
```

#### 依存関係

- `pydantic` (`BaseModel`, `EmailStr`)

#### 未実装・TODO

- NameCard 関連スキーマ（`NameCardCreate`, `NameCardResponse`, `NameCardUpdate` 等）が未定義
- Relationship 関連スキーマが未定義
- Tag 関連スキーマが未定義
- 検索関連スキーマが未定義

---

## 4. API

### 4.1 deps.py

- **ファイルパス**: `backend/app/api/v1/deps.py`
- **目的・責務**: FastAPI 依存性の型エイリアス定義。エンドポイントで繰り返し使う `Depends` を簡潔に記述するため。

#### 実装されている内容

| エイリアス | 型 | 元の依存性 |
|---|---|---|
| `DbSession` | `Annotated[Session, Depends(get_db)]` | `app.core.database.get_db` |
| `AuthUser` | `Annotated[CurrentUser, Depends(get_current_user)]` | `app.core.auth.get_current_user` |

```python
DbSession = Annotated[Session, Depends(get_db)]
AuthUser = Annotated[CurrentUser, Depends(get_current_user)]
```

#### 依存関係

- `app.core.auth.get_current_user`
- `app.core.database.get_db`
- `app.schemas.CurrentUser`

#### 未実装・TODO

- なし（完成済み）

---

### 4.2 endpoints/auth.py

- **ファイルパス**: `backend/app/api/v1/endpoints/auth.py`
- **目的・責務**: ユーザー認証関連のエンドポイント（登録、ログイン、プロフィール取得）。

#### 実装されている内容

**`POST /auth/register`** — ユーザー登録:
- リクエスト: `UserCreate` (`email`, `password`)
- レスポンス: `UserResponse` (201 Created)
- ロジック:
  1. `email` 重複チェック（`select(User).where(User.email == body.email)`）
  2. 重複時 → 409 Conflict `"Email already registered"`
  3. `get_password_hash()` でパスワードハッシュ化
  4. `User` レコード作成 → `db.add()` → `db.commit()` → `db.refresh()`
  5. `UserResponse` を返す

```python
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: DbSession) -> UserResponse:
    existing = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(email=body.email, password_hash=get_password_hash(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at)
```

**`POST /auth/login`** — ログイン:
- リクエスト: `UserLogin` (`email`, `password`)
- レスポンス: `Token` (`access_token`, `token_type`)
- ロジック:
  1. email で `User` を検索
  2. ユーザー不在 or パスワード不一致 → 401 `"Invalid email or password"`
  3. `create_access_token(data={"sub": str(user.id), "email": user.email})` でトークン発行
  4. `Token` を返す

**`GET /auth/me`** — 現在のユーザー情報取得（要認証）:
- 認証: `AuthUser` (JWT Bearer)
- レスポンス: `UserResponse`
- ロジック:
  1. `current_user.id` で `User` を検索
  2. ユーザー不在 → 404 `"User not found"`
  3. `UserResponse` を返す

#### 依存関係

- `app.api.v1.deps.AuthUser`, `DbSession`
- `app.core.auth.create_access_token`, `get_password_hash`, `verify_password`
- `app.models.User`
- `app.schemas.Token`, `UserCreate`, `UserLogin`, `UserResponse`

#### 未実装・TODO

- なし（認証エンドポイントは完成済み）

---

### 4.3 endpoints/images.py

- **ファイルパス**: `backend/app/api/v1/endpoints/images.py`
- **目的・責務**: 名刺画像のアップロード・処理エンドポイント。

#### 実装されている内容

**空ファイル** — ルーターが import されているが、中身は未実装。

```python
# (空)
```

> **注意**: `api.py` で `from app.api.v1.endpoints import images` として import されているが、`images.router` が未定義のためアプリケーション起動時にエラーになる可能性がある。

#### 未実装・TODO

- 画像アップロードエンドポイント（Phase 1: カメラガイド枠 + 四隅選択UI（SVG overlay）+ OpenCV 遠近補正 + Pillow WebP 変換）
- OCR 処理エンドポイント（Phase 1: Gemini 2.5 Flash、OCR と四隅選択の並行処理）
- `router` の定義

---

### 4.4 endpoints/namecards.py

- **ファイルパス**: `backend/app/api/v1/endpoints/namecards.py`
- **目的・責務**: 名刺の CRUD エンドポイント。

#### 実装されている内容

**空ファイル** — ルーターが import されているが、中身は未実装。

```python
# (空)
```

> **注意**: `api.py` で `from app.api.v1.endpoints import namecards` として import されているが、`namecards.router` が未定義のためアプリケーション起動時にエラーになる可能性がある。

#### 未実装・TODO

- 名刺一覧取得 (`GET /namecards`)
- 名刺登録 (`POST /namecards`)
- 名刺詳細取得 (`GET /namecards/{id}`)
- 名刺更新 (`PUT/PATCH /namecards/{id}`)
- 名刺削除 (`DELETE /namecards/{id}`)
- 対応する Pydantic スキーマ（`schemas/__init__.py` に追加が必要）
- `router` の定義

---

### 4.5 endpoints/search.py

- **ファイルパス**: `backend/app/api/v1/endpoints/search.py`
- **目的・責務**: 名刺の検索・フィルタリングエンドポイント。

#### 実装されている内容

**空ファイル** — ルーターが import されているが、中身は未実装。

```python
# (空)
```

> **注意**: `api.py` で `from app.api.v1.endpoints import search` として import されているが、`search.router` が未定義のためアプリケーション起動時にエラーになる可能性がある。

#### 未実装・TODO

- 名刺検索エンドポイント (`GET /search`)（Phase 1: pg_bigm GIN インデックス活用）
- フィルタリング（タグ、関係性、キーワード等）
- 対応する Pydantic スキーマ
- `router` の定義

---

### 4.6 api.py

- **ファイルパス**: `backend/app/api/v1/api.py`
- **目的・責務**: API v1 のルーター集約。各エンドポイントモジュールのルーターを `api_router` に統合。

#### 実装されている内容

```python
from fastapi import APIRouter
from app.api.v1.endpoints import auth, images, namecards, search

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(namecards.router, prefix="/namecards", tags=["namecards"])
```

| ルーター | プレフィックス | タグ | 状態 |
|---|---|---|---|
| `auth.router` | `/auth` | `auth` | ✅ 実装済み |
| `images.router` | `/images` | `images` | ❌ 未実装（空ファイル） |
| `search.router` | `/search` | `search` | ❌ 未実装（空ファイル） |
| `namecards.router` | `/namecards` | `namecards` | ❌ 未実装（空ファイル） |

#### 依存関係

- `app.api.v1.endpoints.auth`
- `app.api.v1.endpoints.images`
- `app.api.v1.endpoints.namecards`
- `app.api.v1.endpoints.search`

#### 未実装・TODO

- `images`, `namecards`, `search` の各エンドポイントファイルに `router` が未定義

---

## 5. Main

- **ファイルパス**: `backend/app/main.py`
- **目的・責務**: FastAPI アプリケーションのエントリーポイント。ログ設定、ミドルウェア、例外ハンドラ、ヘルスチェックを含む。

#### 実装されている内容

##### ログ設定

**`_setup_logging()` 関数**:
- `settings.log_format` に応じて JSON またはテキスト形式を選択
- 外部ライブラリ（`uvicorn.access`, `sqlalchemy.engine`, `httpx`）のノイズを `WARNING` に抑制

```python
def _setup_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    if settings.log_format == "json":
        fmt = '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}'
    else:
        fmt = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
    logging.basicConfig(level=level, format=fmt, force=True)
```

##### ライフサイクル管理

**`lifespan()` コンテキストマネージャ**:
- **startup**: 起動ログ出力
- **shutdown**: `get_engine().dispose()` でコネクションプール解放、`cache_clear()` でキャッシュクリア

##### FastAPI アプリインスタンス

```python
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/api/v1/openapi.json" if settings.debug else None,
    lifespan=lifespan,
)
```

- **本番環境**: `debug=False` の場合、Swagger UI / ReDoc / OpenAPI エンドポイントは無効化

##### 例外ハンドラ

| ハンドラ | 対象例外 | レスポンス |
|---|---|---|
| `http_exception_handler` | `StarletteHTTPException` | `{"detail": "..."}` 形式で返す |
| `validation_exception_handler` | `RequestValidationError` | `{"detail": "Validation error", "errors": [...]}` 形式 (422) |
| `unhandled_exception_handler` | `Exception` | `{"detail": "Internal server error"}` (500)、スタックトレースはログのみ |

**バリデーションエラーのレスポンス例**:
```json
{
  "detail": "Validation error",
  "errors": [
    {"field": "body -> email", "message": "value is not a valid email address"}
  ]
}
```

##### ミドルウェア

**1. CORS ミドルウェア** (最も外側):
- `debug=True`: `http://localhost:3000` のみ許可
- `debug=False`: `settings.allowed_origins` から読み込み
- `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`

**2. Request ID + リクエストログミドルウェア**:
- `X-Request-ID` ヘッダーがあればサニタイズして使用（改行除去、長さ 1〜36 チェック）
- なければ `uuid.uuid4()` で生成
- `request.state.request_id` に設定
- レスポンスヘッダー `X-Request-ID` にも付与
- `{method} {path} -> {status} ({elapsed}ms) [rid={request_id}]` 形式でログ出力

##### ルーター登録

```python
app.include_router(api_router, prefix="/api/v1")
```

全エンドポイントは `/api/v1` プレフィックス下に配置。

##### ヘルスチェック

**`GET /health`**:
- DB 接続確認（`SELECT 1`）
- 成功: `{"status": "ok", "database": "ok"}`
- DB エラー: `{"status": "degraded", "database": "error"}`

```python
@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    try:
        SessionLocal = get_session_local()
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    overall = "ok" if db_status == "ok" else "degraded"
    return {"status": overall, "database": db_status}
```

#### 依存関係

- `app.api.v1.api.api_router` — ルーター集約
- `app.core.config.get_settings` — 設定値
- `app.core.database.get_engine`, `get_session_local` — DB 接続

#### 未実装・TODO

- なし（アプリケーション基盤は完成済み）

---

## 6. Infrastructure

- **ファイルパス**: `docker-compose.yml`
- **目的・責務**: 開発環境の Docker Compose 定義。3 サービス構成。

#### 実装されている内容

##### サービス構成

| サービス | イメージ / ビルド | ポート | 説明 |
|---|---|---|---|
| `frontend` | `./frontend` (target: `dev`) | `3000:3000` | Next.js フロントエンド（**shadcn/ui + SCSS、🚫 Tailwind 不使用、ダークモード対応**） |
| `backend` | `./backend` (target: `dev`) | `8000:8000` | FastAPI バックエンド |
| `db` | `postgres:16-alpine` | `5432:5432` | PostgreSQL データベース |

##### 詳細

**`frontend`**:
- `develop.watch`: `./frontend` を `/app` に同期、`package.json` 変更時にリビルド
- `depends_on`: `backend` (condition: `service_started`)

**`backend`**:
- 環境変数: `DATABASE_URL=postgresql://user:password@db:5432/myapp`
- `develop.watch`: `./backend` を `/app` に同期、`pyproject.toml` 変更時にリビルド
- `depends_on`: `db` (condition: `service_healthy`)

**`db`**:
- PostgreSQL 16 Alpine
- 認証情報: `user` / `password` / `myapp`
- ボリューム: `postgres_data` をマウント（永続化）
- ヘルスチェック: `pg_isready -U user -d myapp`（5秒間隔、5回リトライ）

```yaml
services:
  frontend:
    build:
      context: ./frontend
      target: dev
    ports:
      - "3000:3000"
    develop:
      watch:
        - action: sync
          path: ./frontend
          target: /app
        - action: rebuild
          path: ./frontend/package.json
    depends_on:
      backend:
        condition: service_started

  backend:
    build:
      context: ./backend
      target: dev
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/myapp
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: myapp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

#### 依存関係

- `./frontend/Dockerfile` — フロントエンドビルド
- `./backend/Dockerfile` — バックエンドビルド
- PostgreSQL 16 Alpine 公式イメージ

#### 未実装・TODO

- なし（開発環境構成は完成済み）

---

## 7. Documentation

### 7.1 docs/dev/db/schema.md

- **目的**: データベーススキーマの定義ドキュメント
- **内容**:
  - Mermaid ER 図（`users`, `relationships`, `name_cards`, `tags`, `name_card_tags`, `name_card_relationships`, `contact_methods`）
  - 全 7 テーブルの詳細カラム定義
  - 外部キー制約一覧
  - カスケード動作一覧
  - SQLAlchemy 自動生成インデックス一覧

### 7.2 docs/dev/db/usage.md

- **目的**: データベース操作のコードパターン集
- **内容**:
  - セッション管理（`get_db` の使い方、テスト・スクリプト向け直接利用）
  - 各モデルの CRUD 操作（User, NameCard, Relationship, Tag）
  - `Relationship` の階層構造操作（`get_ancestors`, `get_descendants`, ツリー表示）
  - クエリパターン集:
    - ページネーション
    - タグフィルタリング（AND/OR）
    - 関係性フィルタリング（子孫含む）
    - 名前部分一致検索
    - 全文検索（TODO: PostgreSQL `tsvector`/`tsquery` 導入予定）
  - トランザクション例（名刺+タグ同時作成、ツリー一括作成、関係性移動）
  - 複合クエリ例（`joinedload`/`selectinload` による N+1 回避）

### 7.3 docs/dev/openapi-auto-docs/ (3ファイル)

| ファイル | 目的 | 内容 |
|---|---|---|
| `overview.md` | OpenAPI 自動ドキュメント生成の仕組み解説 | Swagger UI / ReDoc / OpenAPI JSON の違い、フロント・バック分離ワークフロー、TypeScript クライアント生成ツール紹介 |
| `quickstart.md` | 使い始めるための手順書 | メタデータ設定 → エンドポイント実装 → サーバー起動 → フロント共有の 4 ステップ |
| `examples.md` | コードパターン集 | アプリメタデータ設定、タグメタデータ、Pydantic `Field` 活用、複数 `responses` 定義、`openapi_examples` 活用、非推奨エンドポイント、Swagger UI カスタマイズ、TypeScript クライアント生成 |

#### 未実装・TODO

- ドキュメントは充実しているが、NameCard / Relationship / Tag / Search 関連のスキーマ・エンドポイントが未実装のため、実際の OpenAPI ドキュメントにはそれらが含まれない

---

## 8. 全体の実装状況サマリ

### 完成済み ✅

| コンポーネント | ファイル | 概要 |
|---|---|---|
| 設定管理 | `core/config.py` | pydantic-settings ベース、環境変数対応 |
| DB 接続 | `core/database.py` | SQLAlchemy Engine/Session、コネクションプール |
| 認証 | `core/auth.py` | JWT (HS256) + bcrypt パスワードハッシュ |
| ORM モデル | `models/__init__.py` | 7 テーブル（User, NameCard, Relationship, Tag, NameCardTag, NameCardRelationship, ContactMethod） |
| 認証スキーマ | `schemas/__init__.py` | CurrentUser, UserCreate, UserLogin, Token, UserResponse |
| 依存性エイリアス | `api/v1/deps.py` | DbSession, AuthUser |
| 認証 API | `api/v1/endpoints/auth.py` | 登録、ログイン、プロフィール取得 |
| ルーター集約 | `api/v1/api.py` | 4 ルーター統合（auth, images, search, namecards） |
| アプリ基盤 | `main.py` | ログ、ミドルウェア、例外ハンドラ、ヘルスチェック |
| Docker 環境 | `docker-compose.yml` | frontend + backend + PostgreSQL |
| DB ドキュメント | `docs/dev/db/` | スキーマ定義 + 使い方ガイド |
| OpenAPI ドキュメント | `docs/dev/openapi-auto-docs/` | 概要 + クイックスタート + コード例集 |

### 未実装 ❌

| コンポーネント | ファイル | 必要な作業 | フェーズ |
|---|---|---|---|
| 名刺 CRUD API | `api/v1/endpoints/namecards.py` | `router` 定義、CRUD エンドポイント実装、**エラーメッセージ日本語化** | Phase 1 |
| 画像処理 API | `api/v1/endpoints/images.py` | `router` 定義、画像アップロード（**最大 20MB**、カメラガイド枠 + SVG overlay 四隅選択 + OpenCV 遠近補正）、OCR（Gemini 2.5 Flash）実装 | Phase 1 |
| 検索 API | `api/v1/endpoints/search.py` | `router` 定義、pg_bigm GIN インデックス活用、検索・フィルタリング実装 | Phase 1 |
| NameCard スキーマ | `schemas/__init__.py` | NameCardCreate, NameCardResponse, NameCardUpdate 等 | Phase 1 |
| Relationship スキーマ | `schemas/__init__.py` | RelationshipCreate, RelationshipResponse 等 | Phase 1 |
| Tag スキーマ | `schemas/__init__.py` | TagCreate, TagResponse 等 | Phase 1 |
| 検索スキーマ | `schemas/__init__.py` | 検索リクエスト・レスポンス | Phase 1 |
| CSV エクスポート/インポート | 新規 | CSV エクスポート + Google Contacts CSV インポート | Phase 1 |
| vCard エクスポート | 新規 | vCard 3.0 エクスポート | Phase 3（将来） |
| **GitHub Actions CI** | `.github/workflows/` | **Phase 1 から CI を構築**（Docker コンテナで Python 3.14 テスト実行） | Phase 1 |
| **フロントエンド UI** | `frontend/` | **shadcn/ui + SCSS（🚫 Tailwind 不使用）、ダークモード対応、日本語 UI** | Phase 1 |

### 起動時の問題 ⚠️

`api.py` で `images.router`, `namecards.router`, `search.router` を import しているが、これら 3 ファイルは空（`router` が未定義）のため、**現状ではアプリケーションが起動時に `AttributeError` で失敗する可能性が高い**。対処としては:

1. 各空ファイルに最低限 `router = APIRouter()` を追加する
2. または `api.py` の未実装ルーター import をコメントアウトする

### エンドポイント一覧（実装済み + 計画中）

| メソッド | パス | 状態 | 説明 | フェーズ |
|---|---|---|---|---|
| `GET` | `/health` | ✅ 実装済み | ヘルスチェック | — |
| `POST` | `/api/v1/auth/register` | ✅ 実装済み | ユーザー登録 | — |
| `POST` | `/api/v1/auth/login` | ✅ 実装済み | ログイン | — |
| `GET` | `/api/v1/auth/me` | ✅ 実装済み | プロフィール取得 | — |
| `*` | `/api/v1/namecards/*` | ❌ 未実装 | 名刺 CRUD | Phase 1 |
| `*` | `/api/v1/images/*` | ❌ 未実装 | 画像処理 + OCR（Gemini 2.5 Flash） | Phase 1 |
| `*` | `/api/v1/search/*` | ❌ 未実装 | 検索（pg_bigm） | Phase 1 |
| `*` | `/api/v1/export/*` | ❌ 未実装 | CSV エクスポート | Phase 1 |
| `*` | `/api/v1/import/*` | ❌ 未実装 | CSV インポート | Phase 1 |
