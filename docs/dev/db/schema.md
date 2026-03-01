# データベーススキーマ定義

> ソース: `backend/app/models/__init__.py`
> 改訂日: 2026-02-28 — Relationship の M:N 化 / met_notes（フリー入力）追加 / met_at・met_context・company_name 等の削除

## 概念定義

| 概念 | 意味 | 例 |
|---|---|---|
| **Relationship** | 組織情報の階層構造 | `建築士会/桑名支部/青年会長`, `Jasca/三重/理事` |
| **Tag** | フラットな分類ラベル | `ゴルフ仲間`, `友人`, `取引先`, `重要` |
| **ContactMethod** | 連絡先情報 | `email`, `phone`, `fax`, `mobile`, `website` |
| **met_notes** | どこで出会ったか（フリー入力） | `2025年展示会で出会った`, `建築士会定例会`, `友人の紹介` |

### Relationship と Tag の使い分け

- **Relationship**: 入れ子構造（ツリー）で組織の所属を表現。兼務の場合、1人が複数の Relationship に紐付く（M:N）
- **Tag**: 横断的な分類。フラットなラベル付け。構造を持たない

### company_name / department / position が NameCard に不要な理由

Relationship の階層ノードがそれらを包含する:

```
建築士会（ルート）
├── 桑名支部（中間）
│   └── 青年会長（リーフ） ← NameCard はここに紐付く
└── 鈴鹿支部（中間）
    └── 部長（リーフ）
```

名刺一覧で「所属」を表示するには、紐付いた Relationship の `full_path`（祖先を含むパス）を取得する。

## ER図

```mermaid
erDiagram
    users ||--o{ name_cards : "has"
    users ||--o{ relationships : "has"
    users ||--o{ tags : "has"
    relationships ||--o{ relationships : "parent-child"
    name_cards }o--o{ relationships : "belongs to (M:N)"
    name_cards }o--o{ tags : "tagged (M:N)"
    name_cards ||--o{ contact_methods : "has"
    name_card_relationships }|--|| name_cards : "FK"
    name_card_relationships }|--|| relationships : "FK"
    name_card_tags }|--|| name_cards : "FK"
    name_card_tags }|--|| tags : "FK"

    users {
        int id PK "AUTO INCREMENT"
        varchar(255) email UK "NOT NULL"
        varchar(255) password_hash "NOT NULL"
        timestamptz created_at "DEFAULT now()"
        timestamptz updated_at "DEFAULT now(), ON UPDATE now()"
    }

    relationships {
        int id PK "AUTO INCREMENT"
        int user_id FK "NOT NULL -> users.id"
        int parent_id FK "NULLABLE -> relationships.id"
        varchar(100) name "NOT NULL"
    }

    name_cards {
        int id PK "AUTO INCREMENT"
        int user_id FK "NOT NULL -> users.id"
        varchar(100) first_name "NOT NULL"
        varchar(100) last_name "NOT NULL"
        varchar(100) first_name_kana "NULLABLE"
        varchar(100) last_name_kana "NULLABLE"
        varchar(500) image_path "NULLABLE"
        text met_notes "NULLABLE"
        text notes "NULLABLE"
        timestamptz created_at "DEFAULT now()"
        timestamptz updated_at "DEFAULT now(), ON UPDATE now()"
    }

    name_card_relationships {
        int name_card_id PK_FK "-> name_cards.id"
        int relationship_id PK_FK "-> relationships.id"
    }

    tags {
        int id PK "AUTO INCREMENT"
        int user_id FK "NOT NULL -> users.id"
        varchar(100) name "NOT NULL"
    }

    name_card_tags {
        int name_card_id PK_FK "-> name_cards.id"
        int tag_id PK_FK "-> tags.id"
    }

    contact_methods {
        int id PK "AUTO INCREMENT"
        int name_card_id FK "NOT NULL -> name_cards.id"
        varchar(20) type "NOT NULL"
        varchar(50) label "NOT NULL"
        varchar(255) value "NOT NULL"
        boolean is_primary "DEFAULT false"
    }
```

## テーブル定義

### `users` - ユーザー

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | ユーザーID |
| `email` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | メールアドレス（ログインID） |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | パスワードハッシュ |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT now()` | 作成日時 |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT now()`, `ON UPDATE now()` | 更新日時 |

**リレーション:**

- `name_cards`: 1対多（`cascade: all, delete-orphan`）
- `relationships`: 1対多（`cascade: all, delete-orphan`）
- `tags`: 1対多（`cascade: all, delete-orphan`）

---

### `relationships` - 組織情報の階層構造

組織の階層を入れ子で表現する。`parent_id` による自己参照でツリー構造を実現。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | 関係性ID |
| `user_id` | `INTEGER` | `NOT NULL`, `FK → users.id` | 所有ユーザー |
| `parent_id` | `INTEGER` | `NULLABLE`, `FK → relationships.id` | 親ノード（`NULL` = ルート） |
| `name` | `VARCHAR(100)` | `NOT NULL` | ノード名（例: "建築士会", "桑名支部", "青年会長"） |

**リレーション:**

- `user`: 多対1 → `users`
- `parent`: 多対1 → `relationships`（自己参照）
- `children`: 1対多 → `relationships`（自己参照の逆方向）
- `name_cards`: 多対多 → `name_cards`（中間テーブル `name_card_relationships` 経由）

**ツリー構造の例:**

```
建築士会（parent_id=NULL）
├── 桑名支部（parent_id=建築士会.id）
│   └── 青年会長（parent_id=桑名支部.id）
└── 鈴鹿支部（parent_id=建築士会.id）
    └── 部長（parent_id=鈴鹿支部.id）
Jasca（parent_id=NULL）
└── 三重（parent_id=Jasca.id）
    └── 理事（parent_id=三重.id）
```

**full_path の取得:** `get_ancestors()` 再帰 CTE で祖先を遡り、`"建築士会/桑名支部/青年会長"` のようなパスを構築する。

---

### `name_cards` - 名刺

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | 名刺ID |
| `user_id` | `INTEGER` | `NOT NULL`, `FK → users.id` | 所有ユーザー |
| `first_name` | `VARCHAR(100)` | `NOT NULL` | 名 |
| `last_name` | `VARCHAR(100)` | `NOT NULL` | 姓 |
| `first_name_kana` | `VARCHAR(100)` | `NULLABLE` | 名（カナ） |
| `last_name_kana` | `VARCHAR(100)` | `NULLABLE` | 姓（カナ） |
| `image_path` | `VARCHAR(500)` | `NULLABLE` | 名刺画像パス |
| `met_notes` | `TEXT` | `NULLABLE` | どこで出会ったか（フリー入力） |
| `notes` | `TEXT` | `NULLABLE` | 備考 |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT now()` | 作成日時 |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT now()`, `ON UPDATE now()` | 更新日時 |

**削除されたカラム（旧モデルから）:**

| 旧カラム | 移行先 | 理由 |
|---|---|---|
| `email` | `contact_methods` テーブル | 複数メール対応 |
| `phone` | `contact_methods` テーブル | 複数電話番号対応 |
| `relationship_id` (FK) | `name_card_relationships` 中間テーブル | M:N 対応（兼務） |
| `company_name` | 不要 | Relationship の階層で表現 |
| `department` | 不要 | Relationship の階層で表現 |
| `position` | 不要 | Relationship の階層で表現 |
| `met_at` | 不要 | `met_notes` のフリー入力に統合 |
| `met_context` | 不要 | `met_notes` のフリー入力に統合 |

**リレーション:**

- `user`: 多対1 → `users`
- `relationships`: 多対多 → `relationships`（中間テーブル `name_card_relationships` 経由）
- `tags`: 多対多 → `tags`（中間テーブル `name_card_tags` 経由）
- `contact_methods`: 1対多 → `contact_methods`

---

### `name_card_relationships` - 中間テーブル（名刺 ↔ 組織）

名刺と組織（Relationship）の多対多を実現する。兼務の表現に使用。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `name_card_id` | `INTEGER` | `PRIMARY KEY`, `FK → name_cards.id` | 名刺ID |
| `relationship_id` | `INTEGER` | `PRIMARY KEY`, `FK → relationships.id` | 組織ノードID |

複合主キー: `(name_card_id, relationship_id)`

**使用例:**

田中太郎さんが兼務している場合:

| name_card_id | relationship_id | 解決されるパス |
|---|---|---|
| 1 (田中太郎) | 5 (青年会長) | 建築士会/桑名支部/青年会長 |
| 1 (田中太郎) | 8 (理事) | Jasca/三重/理事 |

---

### `tags` - タグ（フラット分類ラベル）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | タグID |
| `user_id` | `INTEGER` | `NOT NULL`, `FK → users.id` | 所有ユーザー |
| `name` | `VARCHAR(100)` | `NOT NULL` | タグ名（例: "ゴルフ仲間", "友人", "取引先", "重要"） |

**リレーション:**

- `user`: 多対1 → `users`
- `name_cards`: 多対多 → `name_cards`（中間テーブル `name_card_tags` 経由）

---

### `name_card_tags` - 中間テーブル（名刺 ↔ タグ）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `name_card_id` | `INTEGER` | `PRIMARY KEY`, `FK → name_cards.id` | 名刺ID |
| `tag_id` | `INTEGER` | `PRIMARY KEY`, `FK → tags.id` | タグID |

複合主キー: `(name_card_id, tag_id)`

---

### `contact_methods` - 連絡先

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | 連絡先ID |
| `name_card_id` | `INTEGER` | `NOT NULL`, `FK → name_cards.id` | 名刺ID |
| `type` | `VARCHAR(20)` | `NOT NULL` | 種別: `email`, `phone`, `fax`, `mobile`, `website`, `twitter`, `github` 等 |
| `label` | `VARCHAR(50)` | `NOT NULL` | ラベル: `"仕事"`, `"自宅"`, `"携帯"` 等 |
| `value` | `VARCHAR(255)` | `NOT NULL` | 値 |
| `is_primary` | `BOOLEAN` | `DEFAULT false` | 同一 type 内の主要連絡先 |

**リレーション:**

- `name_card`: 多対1 → `name_cards`

---

## 外部キー制約一覧

| テーブル | カラム | 参照先 | 備考 |
|---|---|---|---|
| `relationships` | `user_id` | `users.id` | |
| `relationships` | `parent_id` | `relationships.id` | 自己参照、NULLABLE |
| `name_cards` | `user_id` | `users.id` | |
| `name_card_relationships` | `name_card_id` | `name_cards.id` | 複合PKの一部 |
| `name_card_relationships` | `relationship_id` | `relationships.id` | 複合PKの一部 |
| `name_card_tags` | `name_card_id` | `name_cards.id` | 複合PKの一部 |
| `name_card_tags` | `tag_id` | `tags.id` | 複合PKの一部 |
| `tags` | `user_id` | `users.id` | |
| `contact_methods` | `name_card_id` | `name_cards.id` | |

## カスケード動作

| 親テーブル | 子テーブル | SQLAlchemy cascade |
|---|---|---|
| `users` | `name_cards` | `all, delete-orphan` |
| `users` | `relationships` | `all, delete-orphan` |
| `users` | `tags` | `all, delete-orphan` |
| `name_cards` | `contact_methods` | `all, delete-orphan` |

ユーザーを削除すると、そのユーザーに紐づく名刺・関係性・タグがすべて自動削除される。
名刺を削除すると、その名刺に紐づく連絡先がすべて自動削除される。

## インデックス

SQLAlchemy が自動生成するインデックス:

| テーブル | カラム | 種類 | 備考 |
|---|---|---|---|
| `users` | `id` | PRIMARY KEY | 自動 |
| `users` | `email` | UNIQUE INDEX | `unique=True` 指定 |
| `relationships` | `id` | PRIMARY KEY | 自動 |
| `relationships` | `user_id` | INDEX | FK から自動生成 |
| `relationships` | `parent_id` | INDEX | FK から自動生成 |
| `name_cards` | `id` | PRIMARY KEY | 自動 |
| `name_cards` | `user_id` | INDEX | FK から自動生成 |
| `name_card_relationships` | `(name_card_id, relationship_id)` | PRIMARY KEY (複合) | 自動 |
| `tags` | `id` | PRIMARY KEY | 自動 |
| `tags` | `user_id` | INDEX | FK から自動生成 |
| `name_card_tags` | `(name_card_id, tag_id)` | PRIMARY KEY (複合) | 自動 |
| `contact_methods` | `id` | PRIMARY KEY | 自動 |
| `contact_methods` | `name_card_id` | INDEX | FK から自動生成 |
