# backend/db.py 使用方法

名刺管理アプリのデータベース管理モジュール。SQLAlchemy ORM を使用し、FastAPI との連携も想定した設計。

## 概要

- **DBエンジン**: SQLAlchemy 2.0
- **DB種類**: SQLite（開発時）/ PostgreSQL（本番想定）
- **ORMスタイル**: SQLAlchemy 2.0（DeclarativeBase + Mapped構文）
- **セッション管理**: コンテキストマネージャ（@contextmanager）による自動管理

---

## 目次

1. [基本概念](#基本概念)
2. [初期化](#初期化)
3. [基本的な使い方](#基本的な使い方)
4. [モデル定義](#モデル定義)
5. [セッション管理の仕組み](#セッション管理の仕組み)
6. [FastAPIでの使い方](#fastapiでの使い方)
7. [CRUD操作の例](#crud操作の例)
8. [高度な使い方](#高度な使い方)

---

## 基本概念

### 主要コンポーネント

| コンポーネント | 役割 | ファイル内の場所 |
|--------------|------|----------------|
| `Base` | 全モデルの基底クラス | モジュールレベル |
| `NameCard` | 名刺モデル（テーブル定義） | モジュールレベル |
| `init_db()` | DB初期化関数 | 関数定義 |
| `get_session()` | 自動コミット版セッション取得 | @contextmanager |
| `get_db()` | FastAPI用セッション取得 | @contextmanager |
| `NameCardRepository` | CRUD操作ヘルパークラス | クラス定義 |

### 重要なポイント

1. **import時に初期化されない** - `init_db()` を呼ぶまでDB接続は行われない
2. **with文必須** - セッションは必ず `with` 文で取得する
3. **自動コミット** - `get_session()` はwithブロック終了時に自動コミット

---

## 初期化

### 1回だけ呼ぶ必要がある

```python
from backend.db import init_db

# 方法1: 直接URLを指定
init_db("sqlite:///namecards.db")

# 方法2: 環境変数 DATABASE_URL を使用
import os
os.environ["DATABASE_URL"] = "sqlite:///namecards.db"
init_db()

# 方法3: PostgreSQLの場合
init_db("postgresql://user:password@localhost/dbname")
```

### 初期化のタイミング

| アプリケーションタイプ | 初期化タイミング |
|---------------------|---------------|
| スクリプト | スクリプトの最初 |
| FastAPI | `@app.on_event("startup")` |
| テスト | `pytest` のfixtureで |

#### FastAPIの場合の例

```python
from fastapi import FastAPI
from backend.db import init_db

app = FastAPI()

@app.on_event("startup")
def startup():
    init_db("sqlite:///namecards.db")
    # または
    # init_db()  # DATABASE_URL環境変数を使用
```

---

## 基本的な使い方

### 1. データの作成

```python
from backend.db import init_db, get_session, NameCard

# 初期化（アプリ起動時に1回）
init_db("sqlite:///namecards.db")

# データ作成
with get_session() as session:
    card = NameCard(
        first_name="太郎",
        last_name="山田",
        first_name_kana="たろう",
        last_name_kana="やまだ",
        email="taro@example.com",
        company="株式会社サンプル"
    )
    session.add(card)
    # ← withブロック終了時に自動コミット
```

### 2. データの取得

```python
with get_session() as session:
    # 全件取得
    all_cards = session.query(NameCard).all()
    
    # IDで取得
    card = session.get(NameCard, 1)  # ID=1の名刺
    
    # 条件でフィルタ
    yamada_cards = session.query(NameCard).filter(
        NameCard.last_name == "山田"
    ).all()
    
    # 1件だけ取得
    first_card = session.query(NameCard).first()
```

### 3. データの更新

```python
with get_session() as session:
    # 取得して更新
    card = session.get(NameCard, 1)
    if card:
        card.email = "newemail@example.com"
        card.company = "新しい会社"
    # ← withブロック終了時に自動コミット
```

### 4. データの削除

```python
with get_session() as session:
    card = session.get(NameCard, 1)
    if card:
        session.delete(card)
    # ← withブロック終了時に自動コミット
```

---

## モデル定義

### NameCard モデルの構造

```python
class NameCard(Base):
    __tablename__ = "namecards"
    
    # 主キー
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 必須項目
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name_kana: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name_kana: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # オプション項目
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # 自動設定項目
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

### モデルのメソッド

```python
# __repr__ - デバッグ用の文字列表現
card = NameCard(first_name="太郎", last_name="山田")
print(card)  # <NameCard(id=None, name=山田 太郎, company=None)>

# full_name() - フルネームを返す
card = NameCard(first_name="太郎", last_name="山田")
print(card.full_name())  # "山田 太郎"
```

---

## セッション管理の仕組み

### @contextmanager とは

`@contextmanager` は関数を「コンテキストマネージャ」に変換するデコレータです。

```python
from contextlib import contextmanager

@contextmanager
def get_session():
    session = _SessionLocal()      # [1] with開始時
    try:
        yield session               # [2] withブロックにsessionを渡す
        session.commit()            # [3] with成功時
    except Exception:
        session.rollback()          # [3] with失敗時
        raise
    finally:
        session.close()             # [4] 必ず実行
```

### 実行フロー

```python
with get_session() as session:     # [1]→[2] sessionが代入される
    session.add(card)              # ユーザーコード実行
# [2]の次から再開 → [3]または[4]が実行
```

### get_session() vs get_db()

| 関数 | 自動コミット | 用途 |
|-----|------------|------|
| `get_session()` | ✅ あり | 通常のスクリプト・バッチ処理 |
| `get_db()` | ❌ なし | FastAPI（自分でcommit） |

**get_db()を使う場合**（FastAPI）：
```python
from fastapi import Depends
from sqlalchemy.orm import Session
from backend.db import get_db, NameCard

@app.post("/namecards")
def create_card(first_name: str, last_name: str, db: Session = Depends(get_db)):
    card = NameCard(first_name=first_name, last_name=last_name)
    db.add(card)
    db.commit()           # 自分でcommit!
    db.refresh(card)      # IDを取得
    return card
```

---

## FastAPIでの使い方

### 完全な例

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import init_db, get_db, NameCard, NameCardRepository

app = FastAPI()

# アプリ起動時に初期化
@app.on_event("startup")
def startup():
    init_db()  # 環境変数 DATABASE_URL を使用

# 名刺作成
@app.post("/namecards")
def create_namecard(
    first_name: str,
    last_name: str,
    email: str | None = None,
    db: Session = Depends(get_db)
):
    card = NameCardRepository.create(
        db,
        first_name=first_name,
        last_name=last_name,
        email=email
    )
    db.commit()  # Repositoryはflushのみなのでcommitが必要
    db.refresh(card)
    return {
        "id": card.id,
        "full_name": card.full_name(),
        "email": card.email
    }

# 名刺一覧
@app.get("/namecards")
def list_namecards(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    cards = NameCardRepository.get_all(db, skip=skip, limit=limit)
    return cards

# 名刺取得（ID指定）
@app.get("/namecards/{card_id}")
def get_namecard(card_id: int, db: Session = Depends(get_db)):
    card = NameCardRepository.get_by_id(db, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="名刺が見つかりません")
    return card

# 名刺削除
@app.delete("/namecards/{card_id}")
def delete_namecard(card_id: int, db: Session = Depends(get_db)):
    card = NameCardRepository.get_by_id(db, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="名刺が見つかりません")
    NameCardRepository.delete(db, card)
    db.commit()
    return {"message": "削除しました"}
```

---

## CRUD操作の例

### NameCardRepository の使い方

```python
from backend.db import get_session, NameCardRepository

with get_session() as session:
    # 作成
    card = NameCardRepository.create(
        session,
        first_name="太郎",
        last_name="山田",
        email="taro@example.com"
    )
    
    # ID取得（flush済みなのでIDが入っている）
    print(card.id)  # 1
    
    # IDで取得
    found = NameCardRepository.get_by_id(session, 1)
    
    # 一覧取得（ページネーション）
    cards = NameCardRepository.get_all(session, skip=0, limit=10)
    
    # 名前検索
    results = NameCardRepository.search_by_name(session, "山")
    
    # 削除
    NameCardRepository.delete(session, card)

# sessionは自動コミットされる
```

### Repositoryを使わない直接的な操作

```python
from backend.db import get_session, NameCard
from sqlalchemy import or_

with get_session() as session:
    # 複雑なクエリ
    cards = session.query(NameCard).filter(
        or_(
            NameCard.company.contains("株式会社"),
            NameCard.email.endswith("@example.com")
        )
    ).order_by(NameCard.created_at.desc()).all()
    
    # 件数取得
    count = session.query(NameCard).count()
    
    # 部分更新
    session.query(NameCard).filter(
        NameCard.company == "旧会社名"
    ).update({"company": "新会社名"})
```

---

## 高度な使い方

### 複数レコードの一括操作

```python
with get_session() as session:
    # 複数作成（1回のコミット）
    for i in range(100):
        card = NameCard(
            first_name=f"太郎{i}",
            last_name="山田",
            first_name_kana="たろう",
            last_name_kana="やまだ"
        )
        session.add(card)
    # ← withブロック終了時に100件まとめてコミット
```

### トランザクション内での分岐

```python
with get_session() as session:
    try:
        # 処理1
        card1 = NameCard(...)
        session.add(card1)
        
        # 処理2（失敗するかも）
        if some_condition:
            card2 = NameCard(...)
            session.add(card2)
        
        # 問題なければ自動コミット
    except ValueError as e:
        # 例外が発生すると自動ロールバック
        print(f"エラー: {e}")
```

### ネストしたセッション（別々にコミット）

```python
# 1人目 - ここでコミットされる
with get_session() as session1:
    card1 = NameCard(first_name="太郎", last_name="山田")
    session1.add(card1)

# 2人目 - 別途コミットされる
with get_session() as session2:
    card2 = NameCard(first_name="花子", last_name="佐藤")
    session2.add(card2)

# もしsession1で失敗しても、session2は独立している
```

### 環境別設定

```python
# 開発環境（SQLite、SQLログ出力）
init_db("sqlite:///dev.db")
# → db.py内の echo=True でSQLが見える

# テスト環境（インメモリSQLite）
init_db("sqlite:///:memory:")

# 本番環境（PostgreSQL）
init_db("postgresql://user:pass@localhost/mydb")
```

---

## トラブルシューティング

### RuntimeError: Database not initialized

```python
# ❌ エラー
with get_session() as session:  # RuntimeError!
    ...

# ✅ 修正
init_db("sqlite:///namecards.db")  # 先に初期化
with get_session() as session:
    ...
```

### ValueError: Database URL is required

```python
# ❌ エラー
init_db()  # DATABASE_URL環境変数も引数もなし

# ✅ 修正
import os
os.environ["DATABASE_URL"] = "sqlite:///namecards.db"
init_db()
# または
init_db("sqlite:///namecards.db")
```

### セッションを閉じ忘れる

```python
# ❌ 悪い例（接続リークの原因）
session = get_session()  # これはジェネレータ！

# ✅ 正しい例
with get_session() as session:
    ...
```

---

## 参考リンク

- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [FastAPI SQL Database](https://fastapi.tiangolo.com/tutorial/sql-databases/)
