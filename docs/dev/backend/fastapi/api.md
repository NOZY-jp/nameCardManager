# FastAPI API リファレンス

## 目次

- [FastAPIクラス](#fastapiクラス)
- [HTTPメソッドデコレータ](#httpメソッドデコレータ)
- [パラメータ](#パラメータ)
- [Depends](#depends)
- [HTTPException](#httpexception)
- [ミドルウェア](#ミドルウェア)
- [ライフサイクルイベント](#ライフサイクルイベント)

---

## FastAPIクラス

### `FastAPI()`

FastAPIアプリケーションのインスタンスを作成。

**パラメータ:**

| 引数名 | 型 | デフォルト | 説明 |
|-------|-----|----------|------|
| `title` | `str` | "FastAPI" | APIタイトル |
| `description` | `str` | "" | API説明 |
| `version` | `str` | "0.1.0" | APIバージョン |
| `docs_url` | `str \| None` | "/docs" | Swagger UIのURL |
| `redoc_url` | `str \| None` | "/redoc" | ReDocのURL |
| `openapi_url` | `str \| None` | "/openapi.json" | OpenAPIスキーマのURL |
| `root_path` | `str` | "" | リバースプロキシ用のベースパス |

**使用例:**

```python
app = FastAPI(
    title="NameCard API",
    description="名刺管理API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)
```

---

## HTTPメソッドデコレータ

### `@app.get(path, **kwargs)`

GETリクエストを処理するエンドポイントを定義。

**パラメータ:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `path` | `str` | Yes | URLパス（例："/items"）|
| `response_model` | `type` | No | レスポンスのPydanticモデル |
| `status_code` | `int` | No | HTTPステータスコード |
| `tags` | `list[str]` | No | OpenAPIドキュメント用タグ |
| `summary` | `str` | No | エンドポイント概要 |
| `description` | `str` | No | 詳細説明 |

**使用例:**

```python
@app.get("/items/{item_id}", response_model=Item, tags=["items"])
def get_item(item_id: int):
    return {"id": item_id, "name": "Sample"}
```

### `@app.post(path, **kwargs)`

POSTリクエストを処理。

```python
@app.post("/items", status_code=201)
def create_item(item: ItemCreate):
    return item
```

### `@app.put(path, **kwargs)`

PUTリクエストを処理（完全更新）。

```python
@app.put("/items/{item_id}")
def update_item(item_id: int, item: ItemUpdate):
    return {"id": item_id, **item.dict()}
```

### `@app.patch(path, **kwargs)`

PATCHリクエストを処理（部分更新）。

```python
@app.patch("/items/{item_id}")
def patch_item(item_id: int, item: ItemPartialUpdate):
    return {"id": item_id, **item.dict(exclude_unset=True)}
```

### `@app.delete(path, **kwargs)`

DELETEリクエストを処理。

```python
@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    return None
```

---

## パラメータ

### `Path(...)`

パスパラメータの詳細設定。

**パラメータ:**

| 引数名 | 型 | 説明 |
|-------|-----|------|
| `default` | `Any` | デフォルト値（必須の場合は`...`）|
| `title` | `str` | タイトル |
| `description` | `str` | 説明 |
| `gt`, `ge`, `lt`, `le` | `int/float` | 数値の制約 |
| `min_length`, `max_length` | `int` | 文字列長の制約 |
| `regex` | `str` | 正規表現パターン |

**使用例:**

```python
from fastapi import Path

@app.get("/items/{item_id}")
def get_item(
    item_id: int = Path(..., gt=0, description="アイテムID")
):
    return {"item_id": item_id}
```

### `Query(...)`

クエリパラメータの詳細設定。

```python
from fastapi import Query

@app.get("/items")
def list_items(
    skip: int = Query(0, ge=0, description="スキップ件数"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数")
):
    return {"skip": skip, "limit": limit}
```

### `Body(...)`

リクエストボディの詳細設定。

```python
from fastapi import Body

@app.post("/items")
def create_item(
    item: Item = Body(..., embed=True)  # {"item": {...}} 形式
):
    return item
```

### `Header(...)`

ヘッダーパラメータ。

```python
from fastapi import Header

@app.get("/items")
def get_items(
    x_token: str = Header(..., alias="X-Token")
):
    return {"token": x_token}
```

### `Cookie(...)`

クッキーパラメータ。

```python
from fastapi import Cookie

@app.get("/items")
def get_items(
    session_id: str = Cookie(...)
):
    return {"session": session_id}
```

---

## Depends

### `Depends(dependency)`

依存性注入（Dependency Injection）を実現。

**パラメータ:**

| 引数名 | 型 | 説明 |
|-------|-----|------|
| `dependency` | `Callable` | 依存関数 |
| `use_cache` | `bool` | 同じリクエスト内でキャッシュするか |

**使用例:**

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from backend.db import get_db

# 依存関数
def get_token_header(x_token: str = Header(...)):
    if x_token != "secret-token":
        raise HTTPException(400, "Invalid token")
    return x_token

# エンドポイントで使用
@app.get("/items")
def get_items(
    db: Session = Depends(get_db),
    token: str = Depends(get_token_header)
):
    return {"items": []}
```

### ネストした依存

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_repository(db: Session = Depends(get_db)):
    return ItemRepository(db)

@app.get("/items")
def get_items(repo = Depends(get_repository)):
    return repo.get_all()
```

---

## HTTPException

### `HTTPException(status_code, detail, headers)`

HTTPエラーレスポンスを返す。

**パラメータ:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `status_code` | `int` | Yes | HTTPステータスコード |
| `detail` | `str/dict/list` | No | エラー詳細 |
| `headers` | `dict` | No | レスポンスヘッダー |

**使用例:**

```python
from fastapi import HTTPException

@app.get("/items/{item_id}")
def get_item(item_id: int):
    item = find_item(item_id)
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Item {item_id} not found"
        )
    return item
```

**一般的なステータスコード:**

| コード | 説明 | 使用例 |
|-------|------|--------|
| 200 | OK | 成功レスポンス（デフォルト）|
| 201 | Created | リソース作成成功 |
| 204 | No Content | 削除成功等、ボディなし |
| 400 | Bad Request | リクエスト形式エラー |
| 401 | Unauthorized | 認証エラー |
| 403 | Forbidden | 権限エラー |
| 404 | Not Found | リソースが存在しない |
| 422 | Validation Error | バリデーションエラー |
| 500 | Internal Server Error | サーバーエラー |

---

## ミドルウェア

### `app.add_middleware()`

ミドルウェアを追加。

**組み込みミドルウェア:**

#### CORS

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://example.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Trusted Host

```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["example.com", "*.example.com"]
)
```

#### GZip

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

---

## ライフサイクルイベント

### `@app.on_event("startup")`

アプリ起動時に実行。

```python
@app.on_event("startup")
def startup():
    # DB接続初期化等
    init_db()
```

### `@app.on_event("shutdown")`

アプリ終了時に実行。

```python
@app.on_event("shutdown")
def shutdown():
    # リソース解放等
    close_db_connections()
```

---

## APIRouter

### `APIRouter(prefix, tags, dependencies)`

エンドポイントをグループ化するルーター。

**パラメータ:**

| 引数名 | 型 | 説明 |
|-------|-----|------|
| `prefix` | `str` | URLプレフィックス |
| `tags` | `list[str]` | OpenAPIタグ |
| `dependencies` | `list[Depends]` | 共通依存 |
| `responses` | `dict` | 共通レスポンス定義 |

**使用例:**

```python
from fastapi import APIRouter

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(get_token_header)]
)

@router.get("/")
def list_items():
    return []

@router.get("/{item_id}")
def get_item(item_id: int):
    return {"id": item_id}

# main.pyで登録
app.include_router(router)
# → /items/, /items/{item_id}
```

### ルーターのインクルード

```python
app.include_router(
    router,
    prefix="/v1",           # URLプレフィックス追加
    tags=["api"],           # タグ追加
    responses={404: {"description": "Not found"}}  # 共通レスポンス
)
```

---

## BackgroundTasks

### `BackgroundTasks`

レスポンス後にバックグラウンド処理を実行。

```python
from fastapi import BackgroundTasks

def send_email(email: str, message: str):
    # 時間のかかる処理
    pass

@app.post("/send-notification")
def send_notification(
    email: str,
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(send_email, email, "Hello!")
    return {"message": "Notification sent in the background"}
```

---

## UploadFile / File

### ファイルアップロード

```python
from fastapi import File, UploadFile

@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    return {
        "filename": file.filename,
        "content_type": file.content_type
    }

# 複数ファイル
@app.post("/upload-multiple")
def upload_multiple(files: list[UploadFile] = File(...)):
    return [{"filename": f.filename} for f in files]
```

---

## Form

### フォームデータ

```python
from fastapi import Form

@app.post("/login")
def login(
    username: str = Form(...),
    password: str = Form(...)
):
    return {"username": username}
```
