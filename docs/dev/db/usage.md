# データベース使い方ガイド

> ソース: `backend/app/models/__init__.py`, `backend/app/core/database.py`

## セッション管理

### `get_db` の使い方

`get_db()` は FastAPI の `Depends` で使うセッションジェネレーター。リクエストごとにセッションを生成し、終了時に自動で `close()` する。

```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db


@router.get("/items")
def list_items(db: Session = Depends(get_db)):
    """リクエストスコープのセッションが自動注入される。"""
    ...
```

### テストやスクリプトで直接使う場合

```python
from app.core.database import get_session_local

SessionLocal = get_session_local()
db = SessionLocal()
try:
    # 処理
    db.commit()
except Exception:
    db.rollback()
    raise
finally:
    db.close()
```

---

## 基本的な CRUD 操作

### User

#### 作成

```python
from app.models import User

user = User(email="taro@example.com", password_hash="hashed_pw_here")
db.add(user)
db.commit()
db.refresh(user)
# user.id, user.created_at が自動設定される
```

#### 取得

```python
# ID で取得
user = db.get(User, 1)

# email で取得
from sqlalchemy import select

stmt = select(User).where(User.email == "taro@example.com")
user = db.execute(stmt).scalar_one_or_none()
```

#### 更新

```python
user = db.get(User, 1)
user.email = "new_email@example.com"
db.commit()
# updated_at が自動更新される
```

#### 削除

```python
user = db.get(User, 1)
db.delete(user)
db.commit()
# cascade により name_cards, relationships, tags も全削除
```

---

### NameCard

#### 作成

```python
from app.models import NameCard, ContactMethod

card = NameCard(
    user_id=1,
    first_name="太郎",
    last_name="山田",
    first_name_kana="タロウ",
    last_name_kana="ヤマダ",
    met_notes="2025年展示会で出会った",
    notes="営業部の担当者",
)
db.add(card)
db.flush()

# 連絡先を追加
card.contact_methods.append(
    ContactMethod(type="email", label="仕事", value="taro.yamada@example.com", is_primary=True)
)
card.contact_methods.append(
    ContactMethod(type="phone", label="携帯", value="090-1234-5678")
)

# 組織（Relationship）に紐付け（M:N）
rel = db.get(Relationship, 5)  # 建築士会/桑名支部/青年会長
card.relationships.append(rel)

db.commit()
db.refresh(card)
```

#### 取得

```python
card = db.get(NameCard, 1)

# 姓名で検索
stmt = select(NameCard).where(
    NameCard.last_name == "山田",
    NameCard.first_name == "太郎",
)
card = db.execute(stmt).scalar_one_or_none()
```

#### 更新

```python
card = db.get(NameCard, 1)
card.met_notes = "2025年建築士会定例会で出会った"
card.notes = "部署異動で連絡先変更"
db.commit()
```

#### 削除

```python
card = db.get(NameCard, 1)
db.delete(card)
db.commit()
# name_card_tags, name_card_relationships, contact_methods の関連レコードも削除される
```

---

### Relationship（組織情報の階層構造）

#### 作成（ルートと子）

```python
from app.models import Relationship

# ルートノード（parent_id=None）— 組織名
kenchikushikai = Relationship(user_id=1, name="建築士会")
db.add(kenchikushikai)
db.commit()
db.refresh(kenchikushikai)

# 子ノード — 支部
kuwana = Relationship(user_id=1, parent_id=kenchikushikai.id, name="桑名支部")
db.add(kuwana)
db.commit()
db.refresh(kuwana)

# 孫ノード — 役職
seinenkaicho = Relationship(user_id=1, parent_id=kuwana.id, name="青年会長")
db.add(seinenkaicho)
db.commit()
# フルパス: "建築士会/桑名支部/青年会長"
```

#### 取得

```python
rel = db.get(Relationship, 1)

# ユーザーのルート関係性を取得
stmt = select(Relationship).where(
    Relationship.user_id == 1,
    Relationship.parent_id.is_(None),
)
roots = db.execute(stmt).scalars().all()
```

#### フルパスの取得

```python
seinenkaicho = db.get(Relationship, 3)
path = seinenkaicho.get_full_path(db)
# => "建築士会/桑名支部/青年会長"
```

#### 更新

```python
rel = db.get(Relationship, 1)
rel.name = "三重県建築士会"
db.commit()
```

#### 削除

```python
rel = db.get(Relationship, 1)
db.delete(rel)
db.commit()
```

---

### Tag

#### 作成

```python
from app.models import Tag

tag = Tag(user_id=1, name="重要")
db.add(tag)
db.commit()
db.refresh(tag)
```

#### 名刺にタグを付ける

```python
card = db.get(NameCard, 1)
tag = db.get(Tag, 1)
card.tags.append(tag)
db.commit()
```

#### 名刺からタグを外す

```python
card = db.get(NameCard, 1)
tag = db.get(Tag, 1)
card.tags.remove(tag)
db.commit()
```

---

## Relationship の階層構造

### ツリー構造の例

```
建築士会 (id=1, parent_id=NULL)
├── 桑名支部 (id=2, parent_id=1)
│   ├── 青年会長 (id=4, parent_id=2)
│   └── 理事 (id=5, parent_id=2)
└── 津支部 (id=3, parent_id=1)
```

### `get_full_path` - フルパス文字列の取得

祖先を遡って `"建築士会/桑名支部/青年会長"` 形式のパス文字列を返す。

```python
seinenkaicho = db.get(Relationship, 4)  # 青年会長

path = seinenkaicho.get_full_path(db)
# => "建築士会/桑名支部/青年会長"

# ルートノードの場合は自身の名前のみ
kenchikushikai = db.get(Relationship, 1)
kenchikushikai.get_full_path(db)
# => "建築士会"
```

### `get_ancestors` - 祖先を取得（子 → ルートへさかのぼる）

再帰 CTE で1クエリで全祖先を取得する。結果は近い順（親 → 祖父 → ...）。

```python
seinenkaicho = db.get(Relationship, 4)  # 青年会長

ancestors = seinenkaicho.get_ancestors(db)
# => [桑名支部(id=2), 建築士会(id=1)]

for a in ancestors:
    print(a.name)
# 桑名支部
# 建築士会

# ルートノードの場合は空リスト
kenchikushikai = db.get(Relationship, 1)
kenchikushikai.get_ancestors(db)
# => []
```

**パンくずリスト的な使い方:**

```python
seinenkaicho = db.get(Relationship, 4)
# get_full_path を使う方が簡潔
breadcrumb = seinenkaicho.get_full_path(db)
# => "建築士会/桑名支部/青年会長"
```

### `get_descendants` - 子孫を取得（親 → 末端へたどる）

再帰 CTE で1クエリで全子孫を取得する。結果は深さ優先順。

```python
kenchikushikai = db.get(Relationship, 1)  # 建築士会

descendants = kenchikushikai.get_descendants(db)
# => [桑名支部(id=2), 青年会長(id=4), 理事(id=5), 津支部(id=3)]

for d in descendants:
    print(d.name)
# 桑名支部
# 青年会長
# 理事
# 津支部

# 末端ノードの場合は空リスト
seinenkaicho = db.get(Relationship, 4)
seinenkaicho.get_descendants(db)
# => []
```

**ツリー表示の例:**

```python
def print_tree(rel: Relationship, db: Session, indent: int = 0) -> None:
    prefix = "  " * indent + ("├── " if indent > 0 else "")
    print(f"{prefix}{rel.name}")
    for child in rel.children:
        print_tree(child, db, indent + 1)

# ルートから表示
roots = db.execute(
    select(Relationship).where(
        Relationship.user_id == 1,
        Relationship.parent_id.is_(None),
    )
).scalars().all()

for root in roots:
    print_tree(root, db)
```

### 直接の子を取得（リレーション経由）

CTE を使わず、直接の子のみが必要な場合:

```python
kenchikushikai = db.get(Relationship, 1)
children = kenchikushikai.children
# => [桑名支部, 津支部]
```

---

## クエリパターン集

### ユーザーの名刺一覧取得

```python
from sqlalchemy import select
from app.models import NameCard

# 基本: ユーザーの全名刺
stmt = select(NameCard).where(NameCard.user_id == 1)
cards = db.execute(stmt).scalars().all()

# 更新日時の降順
stmt = (
    select(NameCard)
    .where(NameCard.user_id == 1)
    .order_by(NameCard.updated_at.desc())
)
cards = db.execute(stmt).scalars().all()

# ページネーション
stmt = (
    select(NameCard)
    .where(NameCard.user_id == 1)
    .order_by(NameCard.created_at.desc())
    .offset(20)
    .limit(10)
)
cards = db.execute(stmt).scalars().all()
```

### リレーション経由で取得

```python
# User オブジェクトから直接
user = db.get(User, 1)
cards = user.name_cards  # lazy load
```

### タグでフィルタリング

```python
from app.models import NameCard, Tag, NameCardTag

# 特定タグが付いた名刺
stmt = (
    select(NameCard)
    .join(NameCardTag)
    .join(Tag)
    .where(
        NameCard.user_id == 1,
        Tag.name == "重要",
    )
)
cards = db.execute(stmt).scalars().all()

# 複数タグのAND条件（すべてのタグが付いている名刺）
tag_names = ["重要", "取引先"]
stmt = (
    select(NameCard)
    .join(NameCardTag)
    .join(Tag)
    .where(
        NameCard.user_id == 1,
        Tag.name.in_(tag_names),
    )
    .group_by(NameCard.id)
    .having(func.count(Tag.id) == len(tag_names))
)
cards = db.execute(stmt).scalars().all()

# 複数タグのOR条件（いずれかのタグが付いている名刺）
stmt = (
    select(NameCard)
    .join(NameCardTag)
    .join(Tag)
    .where(
        NameCard.user_id == 1,
        Tag.name.in_(["重要", "取引先"]),
    )
    .distinct()
)
cards = db.execute(stmt).scalars().all()
```

### 関係性でフィルタリング

```python
from app.models import NameCard, Relationship, NameCardRelationship

# 特定の関係性に属する名刺（M:N 中間テーブル経由）
stmt = (
    select(NameCard)
    .join(NameCardRelationship)
    .where(
        NameCard.user_id == 1,
        NameCardRelationship.relationship_id == 3,
    )
)
cards = db.execute(stmt).scalars().all()

# 関係性名で検索（JOIN）
stmt = (
    select(NameCard)
    .join(NameCardRelationship)
    .join(Relationship, Relationship.id == NameCardRelationship.relationship_id)
    .where(
        NameCard.user_id == 1,
        Relationship.name == "桑名支部",
    )
)
cards = db.execute(stmt).scalars().all()

# 関係性とその子孫すべてに属する名刺
rel = db.get(Relationship, 1)  # "建築士会"
descendants = rel.get_descendants(db)
rel_ids = [rel.id] + [d.id for d in descendants]

stmt = (
    select(NameCard)
    .join(NameCardRelationship)
    .where(
        NameCard.user_id == 1,
        NameCardRelationship.relationship_id.in_(rel_ids),
    )
    .distinct()
)
cards = db.execute(stmt).scalars().all()
```

### 名前で検索（部分一致）

```python
keyword = "山田"
stmt = (
    select(NameCard)
    .where(
        NameCard.user_id == 1,
        (NameCard.last_name.contains(keyword))
        | (NameCard.first_name.contains(keyword))
        | (NameCard.last_name_kana.contains(keyword))
        | (NameCard.first_name_kana.contains(keyword))
        | (NameCard.met_notes.contains(keyword)),
    )
)
cards = db.execute(stmt).scalars().all()
```

### 全文検索（将来の拡張用）

```python
# TODO: PostgreSQL の全文検索（tsvector / tsquery）を導入予定
#
# 実装イメージ:
#
# from sqlalchemy import func, text
#
# # name_cards テーブルに tsvector カラムを追加
# # search_vector: Mapped[...] = mapped_column(
# #     TSVector, Computed("to_tsvector('japanese', ...)")
# # )
#
# # GIN インデックスを作成
# # Index('ix_name_cards_search', name_cards.c.search_vector, postgresql_using='gin')
#
# query = "山田 太郎"
# stmt = (
#     select(NameCard)
#     .where(
#         NameCard.user_id == 1,
#         NameCard.search_vector.match(query),
#     )
#     .order_by(func.ts_rank(NameCard.search_vector, func.to_tsquery(query)).desc())
# )
# cards = db.execute(stmt).scalars().all()
```

---

## トランザクション例

### 名刺とタグを同時に作成

```python
from app.models import NameCard, Tag, ContactMethod

try:
    # タグ作成
    tag = Tag(user_id=1, name="新規取引")
    db.add(tag)
    db.flush()  # tag.id を確定させる（まだコミットしない）

    # 名刺作成
    card = NameCard(
        user_id=1,
        first_name="花子",
        last_name="鈴木",
        met_notes="2025年展示会で出会った",
    )
    db.add(card)
    db.flush()  # card.id を確定させる

    # 連絡先を追加
    card.contact_methods.append(
        ContactMethod(type="email", label="仕事", value="hanako@example.com", is_primary=True)
    )

    # タグ付け
    card.tags.append(tag)

    # まとめてコミット
    db.commit()
except Exception:
    db.rollback()
    raise
```

### 関係性ツリーの一括作成

```python
from app.models import Relationship

try:
    # ルート
    kenchikushikai = Relationship(user_id=1, name="建築士会")
    db.add(kenchikushikai)
    db.flush()

    # 子ノード
    kuwana = Relationship(user_id=1, parent_id=kenchikushikai.id, name="桑名支部")
    tsu = Relationship(user_id=1, parent_id=kenchikushikai.id, name="津支部")
    db.add_all([kuwana, tsu])
    db.flush()

    # 孫ノード
    seinenkaicho = Relationship(user_id=1, parent_id=kuwana.id, name="青年会長")
    riji = Relationship(user_id=1, parent_id=kuwana.id, name="理事")
    db.add_all([seinenkaicho, riji])

    db.commit()
except Exception:
    db.rollback()
    raise
```

### 名刺の関係性を追加・削除（M:N）

```python
try:
    card = db.get(NameCard, 1)
    new_rel = db.get(Relationship, 5)

    # 追加先がユーザーのものか確認
    if new_rel is None or new_rel.user_id != card.user_id:
        raise ValueError("無効な関係性です")

    # 関係性を追加（兼務対応: 既存の関係性は維持される）
    card.relationships.append(new_rel)
    db.commit()
except Exception:
    db.rollback()
    raise
```

```python
# 関係性を削除
try:
    card = db.get(NameCard, 1)
    old_rel = db.get(Relationship, 3)
    card.relationships.remove(old_rel)
    db.commit()
except Exception:
    db.rollback()
    raise
```

```python
# 関係性を置き換え（全削除して新規追加）
try:
    card = db.get(NameCard, 1)
    new_rels = [db.get(Relationship, 5), db.get(Relationship, 8)]
    card.relationships = [r for r in new_rels if r is not None]
    db.commit()
except Exception:
    db.rollback()
    raise
```

---

## 複合クエリの例

### 名刺一覧（タグ・関係性・連絡先を一括ロード）

N+1 問題を避けるため、`joinedload` / `selectinload` を使う。

```python
from sqlalchemy.orm import selectinload

stmt = (
    select(NameCard)
    .where(NameCard.user_id == 1)
    .options(
        selectinload(NameCard.relationships),
        selectinload(NameCard.tags),
        selectinload(NameCard.contact_methods),
    )
    .order_by(NameCard.updated_at.desc())
)
cards = db.execute(stmt).scalars().unique().all()

for card in cards:
    # 追加クエリなしでアクセス可能
    print(card.last_name, card.first_name)
    for rel in card.relationships:
        print(f"  組織: {rel.get_full_path(db)}")
    print(f"  タグ: {', '.join(t.name for t in card.tags)}")
    for cm in card.contact_methods:
        primary = " ★" if cm.is_primary else ""
        print(f"  {cm.type}({cm.label}): {cm.value}{primary}")
    if card.met_notes:
        print(f"  出会い: {card.met_notes}")
```

### ユーザーの全データを一括取得

```python
stmt = (
    select(User)
    .where(User.id == 1)
    .options(
        selectinload(User.name_cards).selectinload(NameCard.tags),
        selectinload(User.name_cards).selectinload(NameCard.relationships),
        selectinload(User.name_cards).selectinload(NameCard.contact_methods),
        selectinload(User.relationships),
        selectinload(User.tags),
    )
)
user = db.execute(stmt).scalar_one()
```
