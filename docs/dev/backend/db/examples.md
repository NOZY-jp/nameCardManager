# backend/db 使用例集

## 目次

- [基本的なCRUD](#基本的なcrud)
- [NameCardRepositoryの使用例](#namecardrepositoryの使用例)
- [FastAPIでの使用例](#fastapiでの使用例)
- [高度なクエリ](#高度なクエリ)
- [バッチ処理](#バッチ処理)
- [トランザクション制御](#トランザクション制御)

---

## 基本的なCRUD

### データの作成

```python
from backend.db import init_db, get_session, NameCard

# 初期化
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

### データの取得

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

### データの更新

```python
with get_session() as session:
    # 取得して更新
    card = session.get(NameCard, 1)
    if card:
        card.email = "newemail@example.com"
        card.company = "新しい会社"
    # ← withブロック終了時に自動コミット
```

### データの削除

```python
with get_session() as session:
    card = session.get(NameCard, 1)
    if card:
        session.delete(card)
    # ← withブロック終了時に自動コミット
```

---

## NameCardRepositoryの使用例

### 基本的なCRUD

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

---

## FastAPIでの使用例

### 完全なAPI実装

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

## 高度なクエリ

### Repositoryを使わない直接的な操作

```python
from backend.db import get_session, NameCard
from sqlalchemy import or_, and_

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
    
    # 部分更新（一括更新）
    session.query(NameCard).filter(
        NameCard.company == "旧会社名"
    ).update({"company": "新会社名"})
    
    # AND条件
    result = session.query(NameCard).filter(
        and_(
            NameCard.company == "株式会社サンプル",
            NameCard.department == "営業部"
        )
    ).all()
    
    # LIKE検索
    results = session.query(NameCard).filter(
        NameCard.email.like("%@example.com")
    ).all()
```

---

## バッチ処理

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

### チャンク処理（メモリ節約）

```python
from backend.db import get_session, NameCard

def process_in_batches(batch_size=100):
    """大量データをバッチ処理"""
    with get_session() as session:
        offset = 0
        while True:
            cards = session.query(NameCard).offset(offset).limit(batch_size).all()
            if not cards:
                break
            
            for card in cards:
                # 各名刺の処理
                process_card(card)
            
            offset += batch_size

def process_card(card):
    """個別の処理ロジック"""
    print(f"Processing: {card.full_name()}")
```

---

## トランザクション制御

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

### トランザクション内での分岐

```python
with get_session() as session:
    try:
        # 処理1
        card1 = NameCard(
            first_name="太郎",
            last_name="山田",
            first_name_kana="たろう",
            last_name_kana="やまだ"
        )
        session.add(card1)
        
        # 処理2（失敗するかも）
        if some_condition:
            card2 = NameCard(
                first_name="花子",
                last_name="佐藤",
                first_name_kana="はなこ",
                last_name_kana="さとう"
            )
            session.add(card2)
        
        # 問題なければ自動コミット
    except ValueError as e:
        # 例外が発生すると自動ロールバック
        print(f"エラー: {e}")
```

### 明示的なロールバック

```python
from backend.db import init_db, get_session, NameCard

init_db("sqlite:///namecards.db")

# 自動コミットを避けたい場合は、例外を発生させる
with get_session() as session:
    card = NameCard(first_name="太郎", last_name="山田")
    session.add(card)
    
    # 何らかの検証
    if not is_valid(card):
        raise ValueError("無効なデータ")  # これでロールバックされる
    
    # 検証に通れば自動コミット
```

### 手動コミットが必要な場合

```python
from backend.db import init_db, _SessionLocal, NameCard

init_db("sqlite:///namecards.db")

# セッションを手動で管理
Session = _SessionLocal
session = Session()

try:
    card = NameCard(first_name="太郎", last_name="山田")
    session.add(card)
    
    # 明示的にコミット
    session.commit()
    
    # 追加処理
    card2 = NameCard(first_name="花子", last_name="佐藤")
    session.add(card2)
    
    # 別途コミット
    session.commit()
    
except Exception:
    session.rollback()
    raise
finally:
    session.close()
```

---

## サービス層の例

### 別モジュールでの使用

```python
# services/namecard_service.py
from backend.db import get_session, NameCard, NameCardRepository

class NameCardService:
    def add_card(self, first_name: str, last_name: str, email: str = None):
        """名刺を追加する"""
        with get_session() as session:
            card = NameCard(
                first_name=first_name,
                last_name=last_name,
                email=email
            )
            session.add(card)
            return card.id  # 作成されたIDを返す
    
    def get_all_cards(self):
        """全名刺を取得"""
        with get_session() as session:
            return session.query(NameCard).all()
    
    def find_by_name(self, name: str):
        """名前で検索"""
        with get_session() as session:
            return session.query(NameCard).filter(
                (NameCard.first_name == name) | (NameCard.last_name == name)
            ).all()

# 使う側（main.py）
from backend.db import init_db
from services.namecard_service import NameCardService

init_db("sqlite:///namecards.db")

service = NameCardService()
service.add_card("太郎", "山田", "taro@example.com")
cards = service.get_all_cards()
```

---

## 環境別設定

### 開発環境（SQLite、SQLログ出力）

```python
init_db("sqlite:///dev.db")
# → db.py内の echo=True でSQLが見える
```

### テスト環境（インメモリSQLite）

```python
init_db("sqlite:///:memory:")
```

### 本番環境（PostgreSQL）

```python
init_db("postgresql://user:pass@localhost/mydb")
```
