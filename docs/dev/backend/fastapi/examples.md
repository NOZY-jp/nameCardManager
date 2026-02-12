# FastAPI 使用例集

## 目次

- [基本的なCRUD](#基本的なcrud)
- [パラメータの使い方](#パラメータの使い方)
- [Pydanticモデル](#pydanticモデル)
- [依存性注入（Depends）](#依存性注入depends)
- [エラーハンドリング](#エラーハンドリング)
- [ミドルウェア設定](#ミドルウェア設定)
- [データベース連携](#データベース連携)
- [ファイルアップロード](#ファイルアップロード)
- [バックグラウンドタスク](#バックグラウンドタスク)
- [APIルーターの構造化](#apiルーターの構造化)

---

## 基本的なCRUD

### 完全なCRUD例

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI()

# 仮のデータストア
items_db = {}

# Pydanticモデル
class Item(BaseModel):
    id: int
    name: str
    price: float
    description: str = None

class ItemCreate(BaseModel):
    name: str
    price: float
    description: str = None

class ItemUpdate(BaseModel):
    name: str = None
    price: float = None
    description: str = None

# CREATE
@app.post("/items", response_model=Item, status_code=201)
def create_item(item: ItemCreate):
    item_id = len(items_db) + 1
    new_item = Item(id=item_id, **item.dict())
    items_db[item_id] = new_item
    return new_item

# READ (一覧)
@app.get("/items", response_model=List[Item])
def list_items(skip: int = 0, limit: int = 100):
    return list(items_db.values())[skip : skip + limit]

# READ (詳細)
@app.get("/items/{item_id}", response_model=Item)
def get_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    return items_db[item_id]

# UPDATE (完全)
@app.put("/items/{item_id}", response_model=Item)
def update_item(item_id: int, item: ItemCreate):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    updated_item = Item(id=item_id, **item.dict())
    items_db[item_id] = updated_item
    return updated_item

# UPDATE (部分)
@app.patch("/items/{item_id}", response_model=Item)
def patch_item(item_id: int, item: ItemUpdate):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    
    stored_item = items_db[item_id]
    update_data = item.dict(exclude_unset=True)  # 未設定フィールドを除外
    
    for field, value in update_data.items():
        setattr(stored_item, field, value)
    
    return stored_item

# DELETE
@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    del items_db[item_id]
    return None
```

---

## パラメータの使い方

### パスパラメータ

```python
from fastapi import Path

@app.get("/users/{user_id}")
def get_user(
    user_id: int = Path(..., gt=0, description="ユーザーID")
):
    """ユーザーIDは1以上の整数"""
    return {"user_id": user_id}

# 正規表現付き
@app.get("/items/{item_id}")
def get_item(
    item_id: str = Path(..., regex="^item-[0-9]+$")
):
    """item-123 形式のみ受け付け"""
    return {"item_id": item_id}
```

### クエリパラメータ

```python
from fastapi import Query

@app.get("/search")
def search(
    q: str = Query(..., min_length=3, max_length=50),
    category: str = Query(None, enum=["food", "electronics", "clothing"]),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """
    q: 検索キーワード（3-50文字、必須）
    category: カテゴリフィルタ（オプション）
    page: ページ番号（1以上）
    page_size: 1ページあたり件数（1-100）
    """
    return {
        "query": q,
        "category": category,
        "page": page,
        "page_size": page_size
    }

# 複数値のクエリパラメータ
@app.get("/items")
def get_items(
    tags: List[str] = Query(None)  # ?tags=foo&tags=bar
):
    return {"tags": tags}

# 省略時の動作
@app.get("/items")
def get_items(
    q: str = Query(None),           # 省略可能（Noneになる）
    limit: int = Query(100),         # 省略時は100
    required_param: str = Query(...) # 省略不可（...は必須を示す）
):
    return {"q": q, "limit": limit}
```

### リクエストボディ

```python
from pydantic import BaseModel, Field

class Item(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    tax: float = Field(0, ge=0, le=1)
    tags: List[str] = []
    
    class Config:
        schema_extra = {
            "example": {
                "name": "Sample Item",
                "price": 100.0,
                "tax": 0.1,
                "tags": ["new", "sale"]
            }
        }

@app.post("/items")
def create_item(item: Item):
    total = item.price * (1 + item.tax)
    return {**item.dict(), "total": total}

# 複数ボディ
@app.post("/items/merge")
def merge_items(
    item1: Item,
    item2: Item,
    importance: int = Body(...)  # ボディ内の単一値
):
    return {"item1": item1, "item2": item2, "importance": importance}

# 埋め込み形式
@app.post("/items")
def create_item(
    item: Item = Body(..., embed=True)  # {"item": {...}} 形式
):
    return item
```

### ヘッダーとクッキー

```python
from fastapi import Header, Cookie

@app.get("/items")
def get_items(
    user_agent: str = Header(..., convert_underscores=False),
    x_token: str = Header(..., alias="X-Token"),
    session_id: str = Cookie(None)
):
    return {
        "user_agent": user_agent,
        "token": x_token,
        "session": session_id
    }

# オプショナルヘッダー
@app.get("/items")
def get_items(
    api_version: str = Header("v1")  # デフォルト値あり
):
    return {"version": api_version}
```

---

## Pydanticモデル

### モデルの継承

```python
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

# ベースモデル
class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None
    is_active: bool = True

# 作成時（パスワード含む）
class UserCreate(UserBase):
    password: str

# レスポンス用（パスワード除外）
class User(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True  # ORMモデルから変換

# 更新用（全フィールドオプショナル）
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
```

### カスタムバリデーション

```python
from pydantic import BaseModel, validator, root_validator

class User(BaseModel):
    username: str
    password: str
    password_confirm: str
    age: int
    
    @validator('username')
    def username_alphanumeric(cls, v):
        assert v.isalnum(), 'must be alphanumeric'
        return v
    
    @validator('age')
    def age_must_be_positive(cls, v):
        if v < 0:
            raise ValueError('must be positive')
        return v
    
    @root_validator
    def passwords_match(cls, values):
        pw = values.get('password')
        pw_confirm = values.get('password_confirm')
        if pw != pw_confirm:
            raise ValueError('passwords do not match')
        return values
```

---

## 依存性注入（Depends）

### 基本的な使い方

```python
from fastapi import Depends, HTTPException, status

# 依存関数
def get_query_token(token: str):
    if token != "jessica":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Jessica token provided"
        )
    return token

# エンドポイントで使用
@app.get("/items")
def read_items(token: str = Depends(get_query_token)):
    return {"token": token}
```

### データベースセッション

```python
from sqlalchemy.orm import Session
from backend.db import get_db

@app.get("/items")
def get_items(db: Session = Depends(get_db)):
    return db.query(Item).all()

# 複数の依存
@app.post("/items")
def create_item(
    item: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return create_item_db(db, item, current_user.id)
```

### クラスベースの依存

```python
class CommonQueryParams:
    def __init__(
        self,
        q: str = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=1000)
    ):
        self.q = q
        self.skip = skip
        self.limit = limit

@app.get("/items")
def get_items(commons: CommonQueryParams = Depends()):
    return {
        "q": commons.q,
        "items": [],
        "skip": commons.skip,
        "limit": commons.limit
    }
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

def get_service(repo = Depends(get_repository)):
    return ItemService(repo)

@app.get("/items")
def get_items(service = Depends(get_service)):
    return service.get_all()
```

---

## エラーハンドリング

### カスタム例外ハンドラ

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class CustomException(Exception):
    def __init__(self, message: str, status_code: int):
        self.message = message
        self.status_code = status_code

@app.exception_handler(CustomException)
async def custom_exception_handler(request: Request, exc: CustomException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.message, "type": "custom_error"}
    )

@app.get("/items/{item_id}")
def get_item(item_id: int):
    if item_id < 0:
        raise CustomException("Invalid item ID", 400)
    return {"item_id": item_id}
```

### グローバル例外ハンドラ

```python
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail, "error_type": "http_error"}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "message": "Validation error",
            "errors": exc.errors()
        }
    )
```

---

## ミドルウェア設定

### CORS

```python
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://namecard.com",
        "http://localhost:3000",
        "http://localhost:5173",  # Vite
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Custom-Header"],
    max_age=600,  # 10分
)
```

### カスタムミドルウェア

```python
from starlette.middleware.base import BaseHTTPMiddleware
import time

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

app.add_middleware(TimingMiddleware)

# ロギングミドルウェア
import logging

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        logging.info(f"{request.method} {request.url}")
        response = await call_next(request)
        logging.info(f"Status: {response.status_code}")
        return response

app.add_middleware(LoggingMiddleware)
```

---

## データベース連携

### SQLAlchemy連携（完全例）

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel

# 設定
DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# モデル
class ItemDB(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)

# テーブル作成
Base.metadata.create_all(bind=engine)

# 依存

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydanticモデル
class Item(BaseModel):
    name: str
    description: str = None
    
    class Config:
        from_attributes = True

# アプリ
app = FastAPI()

@app.post("/items", response_model=Item)
def create_item(item: Item, db: Session = Depends(get_db)):
    db_item = ItemDB(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/items/{item_id}", response_model=Item)
def read_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ItemDB).filter(ItemDB.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.get("/items", response_model=list[Item])
def read_items(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    items = db.query(ItemDB).offset(skip).limit(limit).all()
    return items
```

---

## ファイルアップロード

### 単一ファイル

```python
from fastapi import File, UploadFile

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents)
    }

# 保存
@app.post("/upload-save")
async def upload_and_save(file: UploadFile = File(...)):
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        contents = await file.read()
        f.write(contents)
    return {"saved_to": file_path}
```

### 複数ファイル

```python
@app.post("/upload-multiple")
async def upload_multiple(files: list[UploadFile] = File(...)):
    return [
        {"filename": f.filename, "size": len(await f.read())}
        for f in files
    ]
```

### ファイル + JSONデータ

```python
from fastapi import Form

@app.post("/upload-with-data")
async def upload_with_data(
    file: UploadFile = File(...),
    description: str = Form(...),
    tags: str = Form(None)
):
    return {
        "filename": file.filename,
        "description": description,
        "tags": tags.split(",") if tags else []
    }
```

---

## バックグラウンドタスク

### メール送信等

```python
from fastapi import BackgroundTasks
import time

def send_email(email: str, message: str):
    # 時間のかかる処理
    time.sleep(2)
    print(f"Email sent to {email}: {message}")

def write_log(message: str):
    with open("log.txt", "a") as f:
        f.write(f"{message}\n")

@app.post("/send-notification")
def send_notification(
    email: str,
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(send_email, email, "Hello!")
    background_tasks.add_task(write_log, f"Notification sent to {email}")
    return {"message": "Notification queued"}
```

---

## APIルーターの構造化

### 推奨構造

```
backend/
├── main.py
└── api/
    ├── __init__.py
    └── v1/
        ├── __init__.py
        ├── items.py
        └── users.py
```

### api/v1/items.py

```python
from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.get("/")
def list_items():
    return []

@router.get("/{item_id}")
def get_item(item_id: int):
    return {"id": item_id}
```

### api/v1/__init__.py

```python
from fastapi import APIRouter
from api.v1 import items, users

v1_router = APIRouter()
v1_router.include_router(items.router, prefix="/items", tags=["items"])
v1_router.include_router(users.router, prefix="/users", tags=["users"])
```

### api/__init__.py

```python
from fastapi import APIRouter
from api.v1 import v1_router

api_router = APIRouter()
api_router.include_router(v1_router, prefix="/v1")
```

### main.py

```python
from fastapi import FastAPI
from api import api_router

app = FastAPI()
app.include_router(api_router)
```

---

## ライフサイクルイベント

```python
from backend.db import init_db

@app.on_event("startup")
async def startup():
    print("Starting up...")
    init_db()

@app.on_event("shutdown")
async def shutdown():
    print("Shutting down...")
    # クリーンアップ処理
```

---

## 参考リンク

- [FastAPI公式ドキュメント](https://fastapi.tiangolo.com/)
- [FastAPIチュートリアル](https://fastapi.tiangolo.com/tutorial/)
