# Examples - OpenAPI ドキュメントを充実させるコードパターン集

このプロジェクト (nameCardManager) の文脈で使える具体的なパターンを集めた。
コピペして使えるようにしている。

---

## 1. アプリのメタデータ設定

```python
from fastapi import FastAPI

app = FastAPI(
    title="NameCard Manager API",
    description="""
名刺管理アプリケーションのバックエンドAPI。

## 機能
* 名刺の登録・取得・更新・削除
* 画像アップロード・OCR処理
* 名刺の検索・フィルタリング
* ユーザー認証

## 認証
Bearer トークンを `Authorization` ヘッダーに含めてリクエストしてください。
""",
    version="0.1.0",
    contact={
        "name": "開発チーム",
        "url": "https://github.com/your-org/nameCardManager",
    },
    license_info={
        "name": "MIT",
    },
)
```

**ドキュメントでの表示**: description の Markdown はそのまま Swagger UI / ReDoc でレンダリングされる。

---

## 2. タグにメタデータを追加

`tags` にメタデータを付けると、ドキュメント上のグループに説明がつく:

```python
tags_metadata = [
    {
        "name": "namecards",
        "description": "名刺の CRUD 操作。",
    },
    {
        "name": "auth",
        "description": "認証・認可関連のエンドポイント。",
    },
    {
        "name": "images",
        "description": "名刺画像のアップロードと処理。",
    },
    {
        "name": "search",
        "description": "名刺の検索・フィルタリング。",
    },
]

app = FastAPI(
    title="NameCard Manager API",
    openapi_tags=tags_metadata,
)
```

---

## 3. Pydantic モデルでフィールドを詳細に文書化

```python
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime


class NameCardCreate(BaseModel):
    """名刺の新規登録リクエスト。"""

    first_name: str = Field(
        ...,
        description="名",
        min_length=1,
        max_length=50,
        examples=["太郎"],
    )
    last_name: str = Field(
        ...,
        description="姓",
        min_length=1,
        max_length=50,
        examples=["山田"],
    )
    first_name_kana: str = Field(
        ...,
        description="名 (カナ)",
        examples=["タロウ"],
    )
    last_name_kana: str = Field(
        ...,
        description="姓 (カナ)",
        examples=["ヤマダ"],
    )
    email: EmailStr | None = Field(
        None,
        description="メールアドレス",
        examples=["taro.yamada@example.com"],
    )
    phone: str | None = Field(
        None,
        description="電話番号",
        examples=["090-1234-5678"],
    )
    company: str | None = Field(
        None,
        description="会社名",
        examples=["株式会社Example"],
    )
    department: str | None = Field(
        None,
        description="部署名",
        examples=["開発部"],
    )
    position: str | None = Field(
        None,
        description="役職",
        examples=["エンジニア"],
    )
    notes: str | None = Field(
        None,
        description="メモ",
        max_length=1000,
    )
```

**効果**: Swagger UI の "Try it out" で、`examples` の値が自動入力される。

---

## 4. エンドポイントの詳細な文書化

```python
from fastapi import APIRouter, HTTPException, Query, Path

router = APIRouter()


@router.get(
    "/",
    response_model=list[NameCardResponse],
    summary="名刺一覧取得",
    description="登録済みの名刺をページネーション付きで取得する。",
    response_description="名刺のリスト",
)
async def list_namecards(
    skip: int = Query(
        0,
        ge=0,
        description="スキップする件数",
        examples=[0],
    ),
    limit: int = Query(
        20,
        ge=1,
        le=100,
        description="取得する最大件数",
        examples=[20],
    ),
):
    """
    名刺を一覧で取得する。

    - **skip**: 先頭からスキップする件数 (ページネーション用)
    - **limit**: 1回で取得する最大件数 (1〜100)
    """
    ...
```

**ポイント**: docstring の Markdown がドキュメントに展開される。箇条書きも使える。

---

## 5. 複数のレスポンスステータスを文書化

```python
@router.get(
    "/{namecard_id}",
    response_model=NameCardResponse,
    summary="名刺詳細取得",
    responses={
        200: {
            "description": "名刺の詳細情報",
            "content": {
                "application/json": {
                    "example": {
                        "id": 1,
                        "first_name": "太郎",
                        "last_name": "山田",
                        "company": "株式会社Example",
                        "created_at": "2025-01-01T00:00:00",
                        "updated_at": "2025-01-01T00:00:00",
                    }
                }
            },
        },
        404: {
            "description": "指定IDの名刺が見つからない",
            "content": {
                "application/json": {
                    "example": {"detail": "NameCard not found"}
                }
            },
        },
        422: {
            "description": "バリデーションエラー",
        },
    },
)
async def get_namecard(
    namecard_id: int = Path(..., description="名刺のID", ge=1, examples=[1]),
):
    """指定IDの名刺を取得する。"""
    ...
```

---

## 6. リクエストボディに複数の example を定義

```python
from fastapi import Body


@router.post(
    "/",
    response_model=NameCardResponse,
    status_code=201,
    summary="名刺登録",
)
async def create_namecard(
    data: NameCardCreate = Body(
        ...,
        openapi_examples={
            "minimal": {
                "summary": "最小限の入力",
                "description": "必須フィールドのみ",
                "value": {
                    "first_name": "太郎",
                    "last_name": "山田",
                    "first_name_kana": "タロウ",
                    "last_name_kana": "ヤマダ",
                },
            },
            "full": {
                "summary": "全フィールド入力",
                "description": "任意フィールドも全て含む",
                "value": {
                    "first_name": "太郎",
                    "last_name": "山田",
                    "first_name_kana": "タロウ",
                    "last_name_kana": "ヤマダ",
                    "email": "taro.yamada@example.com",
                    "phone": "090-1234-5678",
                    "company": "株式会社Example",
                    "department": "開発部",
                    "position": "エンジニア",
                    "notes": "展示会で交換",
                },
            },
        },
    ),
):
    """新しい名刺を登録する。"""
    ...
```

**効果**: Swagger UI で example をドロップダウンから選択できる。フロント開発者がリクエスト形式をすぐ把握できる。

---

## 7. 非推奨 (deprecated) エンドポイント

```python
@router.get(
    "/old-search",
    response_model=list[NameCardResponse],
    deprecated=True,
    summary="[非推奨] 旧検索API",
    description="代わりに /search エンドポイントを使用してください。",
)
async def old_search(q: str):
    ...
```

**効果**: Swagger UI / ReDoc で取り消し線が表示され、非推奨であることが一目瞭然。

---

## 8. ドキュメントURLのカスタマイズ

```python
# /api/v1 プレフィックス下にドキュメントを配置
app = FastAPI(
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
)

# ドキュメントを無効化 (本番環境用)
app = FastAPI(
    docs_url=None,    # Swagger UI 無効
    redoc_url=None,   # ReDoc 無効
    # openapi_url=None,  # これも消すとスキーマ自体が無効
)
```

---

## 9. Swagger UI の設定カスタマイズ

```python
app = FastAPI(
    swagger_ui_parameters={
        "deepLinking": True,          # URLでエンドポイントを直接リンク
        "persistAuthorization": True,  # 認証トークンをリロード後も保持
        "displayRequestDuration": True,  # リクエスト時間を表示
        "filter": True,               # エンドポイント検索バーを表示
        "defaultModelsExpandDepth": 3,  # スキーマの展開深さ
    }
)
```

**特に `persistAuthorization: True` が便利**: フロント開発者がトークンを毎回入力し直さなくてよい。

---

## 10. openapi.json から TypeScript クライアントを生成

```bash
# openapi-typescript を使う場合
npx openapi-typescript http://localhost:8000/openapi.json \
  -o ./src/generated/api.d.ts

# hey-api/openapi-ts を使う場合 (クライアントコードも生成)
npx @hey-api/openapi-ts \
  -i http://localhost:8000/openapi.json \
  -o ./src/generated \
  -c @hey-api/client-fetch
```

`package.json` の scripts に登録しておくと便利:

```json
{
  "scripts": {
    "generate:api": "openapi-typescript http://localhost:8000/openapi.json -o ./src/generated/api.d.ts"
  }
}
```

```bash
pnpm run generate:api
```

---

## まとめ: 最低限やるべきこと

バックエンド実装時に以下を守るだけで、フロントエンド開発者が困らないドキュメントが自動生成される:

1. **`response_model` を必ず指定する** → レスポンス構造がドキュメントに出る
2. **Pydantic `Field` に `description` を書く** → フィールドの意味が伝わる
3. **`summary` を書く** → エンドポイント一覧が見やすくなる
4. **`examples` を付ける** → "Try it out" で即テストできる
5. **エラーレスポンスを `responses` で定義する** → フロントのエラーハンドリングが楽になる
