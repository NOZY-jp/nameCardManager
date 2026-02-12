# Backend API 設計計画書

## 1. アーキテクチャ概要

### ドメイン構成
- **フロントエンド**: `namecard.com` (Next.js)
- **API**: `api.namecard.com` (FastAPI)

### 技術スタック
- **Framework**: FastAPI
- **Database**: SQLAlchemy 2.0 + SQLite(開発) / PostgreSQL(本番)
- **Documentation**: Swagger UI (`/docs`), ReDoc (`/redoc`)

---

## 2. ファイル構造

```
backend/
├── main.py                 # エントリーポイント（超薄型）
├── config.py              # 環境変数・設定
├── db.py                  # データベース（SQLAlchemy）
├── api/
│   ├── __init__.py        # APIルーター集約
│   ├── deps.py            # 依存性注入（DBセッション等）
│   └── v1/
│       ├── __init__.py
│       ├── namecards.py   # 名刺APIエンドポイント
│       └── ocr.py         # OCR処理APIエンドポイント
├── services/
│   ├── __init__.py
│   ├── namecard_service.py    # 名刺ビジネスロジック
│   └── ocr_service.py         # OCRビジネスロジック
└── models/
    ├── __init__.py
    ├── schemas.py         # Pydanticスキーマ（リクエスト/レスポンス）
    └── domain.py          # ドメインモデル（必要に応じて）
```

---

## 3. 層の責任分担

| 層 | 責任 | 例 |
|---|------|-----|
| **main.py** | アプリ起動、設定読み込み、ミドルウェア登録 | 10-20行程度 |
| **api/** | HTTPリクエスト/レスポンス、URLルーティング | FastAPIルーター、バリデーション |
| **services/** | ビジネスロジック、複雑な処理 | OCR処理、データ加工、外部API連携 |
| **db.py** | データアクセス、DBモデル定義 | SQLAlchemyモデル、セッション管理 |
| **models/** | データ構造定義 | Pydanticスキーマ、ドメインオブジェクト |

### 哲学：「Thin main.py」

先輩からの教訓：**main.pyはシンプルに保つ**

- main.pyは「アプリを組み立てる」だけ
- 具体的なロジックは各モジュールに委譲
- 機能追加は新しいファイルを作るだけで済む構造

---

## 4. API設計

### ベースURL
```
https://api.namecard.com/v1/
```

### エンドポイント一覧

#### 名刺管理
| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/namecards` | 名刺一覧取得（ページネーション）|
| GET | `/namecards/{id}` | 名刺詳細取得 |
| POST | `/namecards` | 名刺作成 |
| PUT | `/namecards/{id}` | 名刺更新（完全）|
| PATCH | `/namecards/{id}` | 名刺更新（部分）|
| DELETE | `/namecards/{id}` | 名刺削除 |
| GET | `/namecards/search?q={query}` | 名刺検索 |

#### OCR処理
| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| POST | `/ocr` | 名刺画像アップロード＆解析 |
| GET | `/ocr/{job_id}/status` | OCR処理状態確認 |
| GET | `/ocr/{job_id}/result` | OCR結果取得 |

---

## 5. 主要コンポーネント詳細

### 5.1 main.py
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import api_router
from config import settings
from db import init_db

app = FastAPI(
    title="NameCard API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,  # ["https://namecard.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB初期化
@app.on_event("startup")
def startup():
    init_db(settings.DATABASE_URL)

# ルーター登録
app.include_router(api_router, prefix="/v1")
```

### 5.2 api/__init__.py
```python
from fastapi import APIRouter
from api.v1 import namecards, ocr

api_router = APIRouter()

api_router.include_router(
    namecards.router,
    prefix="/namecards",
    tags=["namecards"]
)

api_router.include_router(
    ocr.router,
    prefix="/ocr",
    tags=["ocr"]
)
```

### 5.3 api/deps.py
```python
from fastapi import Depends
from sqlalchemy.orm import Session
from db import get_db as get_db_session

# DBセッション依存性
get_db = get_db_session
```

### 5.4 api/v1/namecards.py
```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from api.deps import get_db
from services.namecard_service import NameCardService
from models.schemas import NameCardCreate, NameCardResponse

router = APIRouter()

@router.get("/", response_model=List[NameCardResponse])
def list_namecards(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """名刺一覧を取得"""
    service = NameCardService(db)
    return service.get_all(skip=skip, limit=limit)

@router.post("/", response_model=NameCardResponse)
def create_namecard(
    card_data: NameCardCreate,
    db: Session = Depends(get_db)
):
    """名刺を作成"""
    service = NameCardService(db)
    return service.create(card_data)

@router.get("/{card_id}", response_model=NameCardResponse)
def get_namecard(
    card_id: int,
    db: Session = Depends(get_db)
):
    """名刺詳細を取得"""
    service = NameCardService(db)
    card = service.get_by_id(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="名刺が見つかりません")
    return card

@router.get("/search", response_model=List[NameCardResponse])
def search_namecards(
    q: str = Query(..., min_length=1, description="検索キーワード"),
    db: Session = Depends(get_db)
):
    """名刺を検索"""
    service = NameCardService(db)
    return service.search(q)
```

### 5.5 services/namecard_service.py
```python
from sqlalchemy.orm import Session
from db import NameCard, NameCardRepository

class NameCardService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = NameCardRepository()
    
    def get_all(self, skip: int = 0, limit: int = 100):
        """全名刺取得（ページネーション）"""
        return self.repo.get_all(self.db, skip=skip, limit=limit)
    
    def get_by_id(self, card_id: int):
        """IDで名刺取得"""
        return self.repo.get_by_id(self.db, card_id)
    
    def create(self, card_data):
        """名刺作成"""
        card = self.repo.create(
            self.db,
            first_name=card_data.first_name,
            last_name=card_data.last_name,
            email=card_data.email,
            # ... 他のフィールド
        )
        self.db.commit()
        self.db.refresh(card)
        return card
    
    def search(self, query: str):
        """名刺検索"""
        return self.repo.search_by_name(self.db, query)
```

### 5.6 models/schemas.py
```python
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class NameCardBase(BaseModel):
    first_name: str
    last_name: str
    first_name_kana: str
    last_name_kana: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None

class NameCardCreate(NameCardBase):
    pass

class NameCardResponse(NameCardBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True  # SQLAlchemyモデルから変換
```

---

## 6. 検索機能の設計

### 方針
- **デバウンス**: Next.js側で実装（300ms）
- **API側**: キャッシングなし、高速なクエリで対応
- **レート制限**: 必要に応じて後で追加

### フロー
```
ユーザー入力 → Next.js（デバウンス300ms）→ API呼び出し → 結果表示
```

### API実装
```python
@router.get("/search")
def search_namecards(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
):
    # 姓または名で部分一致検索
    return db.query(NameCard).filter(
        (NameCard.first_name.contains(q)) | 
        (NameCard.last_name.contains(q)) |
        (NameCard.first_name_kana.contains(q)) |
        (NameCard.last_name_kana.contains(q))
    ).all()
```

---

## 7. CORS設定

```python
# config.py
ALLOWED_ORIGINS = [
    "https://namecard.com",
    "http://localhost:3000",  # 開発用
]

# main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. 開発ステップ

### Phase 1: 基盤構築
1. `config.py` 作成（環境変数管理）
2. `main.py` セットアップ
3. `api/__init__.py` ルーティング構造
4. `api/deps.py` 依存性設定

### Phase 2: 名刺API実装
1. `models/schemas.py` Pydanticスキーマ
2. `services/namecard_service.py` ビジネスロジック
3. `api/v1/namecards.py` エンドポイント

### Phase 3: OCR API実装（別途設計）
1. `services/ocr_service.py`
2. `api/v1/ocr.py`

### Phase 4: テスト・ドキュメント
1. 各エンドポイントのテスト
2. APIドキュメント整備

---

## 9. 実装ルール

### 必須
- main.pyは薄く保つ（インポートと登録のみ）
- 各エンドポイントは `api/v1/` に配置
- ビジネスロジックは `services/` に分離
- Pydanticスキーマは `models/schemas.py` に定義

### 推奨
- 型ヒントを必ず付ける
- docstringでエンドポイントの説明を記載
- HTTPステータスコードを適切に返す（200, 201, 404, 422等）

### 禁止
- main.pyにビジネスロジックを書かない
- APIルーターで直接DBクエリを書かない（service層経由）

---

## 10. 参考資料

- FastAPI公式: https://fastapi.tiangolo.com/
- SQLAlchemy 2.0: https://docs.sqlalchemy.org/en/20/
- Pydantic: https://docs.pydantic.dev/

---

## 更新履歴

| 日付 | 内容 |
|-----|------|
| 2026-02-11 | 初版作成 |
