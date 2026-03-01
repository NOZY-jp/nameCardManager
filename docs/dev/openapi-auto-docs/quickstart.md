# クイックスタート - FastAPI OpenAPI 自動ドキュメント

このプロジェクト (nameCardManager) で OpenAPI 自動ドキュメントを使い始めるための手順。

---

## 前提条件

- `fastapi[standard]` がインストール済み (pyproject.toml に記載済み)
- 追加パッケージのインストールは **不要**

---

## Step 1: FastAPI アプリにメタデータを設定する

`main.py` (もしくはアプリのエントリーポイント) で `FastAPI()` にメタデータを渡す:

```python
from fastapi import FastAPI

app = FastAPI(
    title="NameCard Manager API",
    description="名刺管理アプリケーションのバックエンドAPI",
    version="0.1.0",
    # ドキュメントのURL (デフォルトでOKだが、カスタマイズも可能)
    docs_url="/docs",          # Swagger UI
    redoc_url="/redoc",        # ReDoc
    openapi_url="/openapi.json",  # OpenAPI スキーマ
)
```

> これだけで `/docs`, `/redoc`, `/openapi.json` が有効になる。

---

## Step 2: エンドポイントを実装する

既存の `backend/app/api/v1/endpoints/namecards.py` にエンドポイントを追加する例:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

router = APIRouter()


# --- Pydantic スキーマ ---
class NameCardCreate(BaseModel):
    """名刺作成リクエスト"""
    first_name: str = Field(..., description="名", examples=["太郎"])
    last_name: str = Field(..., description="姓", examples=["山田"])
    company: str | None = Field(None, description="会社名", examples=["株式会社Example"])
    email: str | None = Field(None, description="メールアドレス")


class NameCardResponse(NameCardCreate):
    """名刺レスポンス"""
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- エンドポイント ---
@router.get(
    "/",
    response_model=list[NameCardResponse],
    summary="名刺一覧取得",
    description="登録済みの名刺を一覧で取得する。",
)
async def list_namecards():
    """全ての名刺を返す。"""
    ...


@router.post(
    "/",
    response_model=NameCardResponse,
    status_code=201,
    summary="名刺登録",
)
async def create_namecard(data: NameCardCreate):
    """新しい名刺を登録する。"""
    ...


@router.get(
    "/{namecard_id}",
    response_model=NameCardResponse,
    summary="名刺詳細取得",
    responses={404: {"description": "名刺が見つからない"}},
)
async def get_namecard(namecard_id: int):
    """指定IDの名刺を取得する。"""
    ...
```

---

## Step 3: サーバーを起動してドキュメントを確認

```bash
# backend ディレクトリで
fastapi dev app/main.py
```

ブラウザで以下にアクセス:

| URL | 内容 |
|---|---|
| http://localhost:8000/docs | Swagger UI (インタラクティブ) |
| http://localhost:8000/redoc | ReDoc (リファレンス形式) |
| http://localhost:8000/openapi.json | 生の OpenAPI スキーマ |

---

## Step 4: フロントエンド開発者に共有する

### 方法A: URL を共有 (最もシンプル)

バックエンドサーバーが起動していれば、フロントエンド開発者はブラウザで `/docs` を開くだけ。

### 方法B: openapi.json をエクスポート

```bash
# サーバー起動中に
curl http://localhost:8000/openapi.json > openapi.json
```

このファイルをリポジトリにコミットすれば、サーバーが起動していなくてもスキーマを参照できる。

### 方法C: TypeScript クライアントを自動生成 (推奨)

```bash
# フロントエンドディレクトリで
npx openapi-typescript http://localhost:8000/openapi.json -o ./src/generated/api.d.ts
```

これで TypeScript の型定義が自動生成される。バックエンドの変更がフロントの型エラーとして即座に検出される。

---

## ドキュメントの質を上げるポイント

上記の Step 2 のコードに含まれている以下の要素が、ドキュメントの質を決める:

| 要素 | 場所 | ドキュメントでの表示 |
|---|---|---|
| `summary` | デコレータ引数 | エンドポイント名の横に表示 |
| `description` | デコレータ引数 or docstring | エンドポイントの詳細説明 |
| `response_model` | デコレータ引数 | レスポンスの JSON Schema |
| `Field(description=...)` | Pydantic フィールド | 各フィールドの説明 |
| `Field(examples=[...])` | Pydantic フィールド | 入力例 |
| `responses={404: ...}` | デコレータ引数 | エラーレスポンスの文書化 |
| `tags` | ルーター or デコレータ | グループ分け |
| docstring | 関数本体 | エンドポイントの説明 (description未指定時) |

---

## 次のステップ

- 具体的なコード例をもっと見たい → [examples.md](./examples.md)
- 全体像を理解したい → [overview.md](./overview.md)
