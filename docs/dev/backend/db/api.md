# backend/db API リファレンス

## 目次

- [初期化関数](#初期化関数)
- [セッション取得関数](#セッション取得関数)
- [モデルクラス](#モデルクラス)
- [リポジトリクラス](#リポジトリクラス)

---

## 初期化関数

### `init_db(database_url: str | None = None) -> None`

データベースを初期化する。アプリ起動時に1回だけ呼ぶ必要がある。

**引数:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `database_url` | `str \| None` | No | データベースURL。未指定の場合は環境変数 `DATABASE_URL` を使用 |

**例外:**

- `ValueError`: `DATABASE_URL` 環境変数も引数も設定されていない場合

**使用例:**

```python
# 方法1: 直接URLを指定
init_db("sqlite:///namecards.db")

# 方法2: 環境変数 DATABASE_URL を使用
import os
os.environ["DATABASE_URL"] = "sqlite:///namecards.db"
init_db()

# 方法3: Postg2. yield版（ジェネレータ）
def generator_function():
    print("start")
    yield "A"      # ← ここで一旦停止、値を返す
    print("middle")
    yield "B"      # ← 再開してここでまた停止
    print("end")
gen = generator_function()  # 関数を呼んでもまだ実行されない！
print(next(gen))  # start → A
print(next(gen))  # middle → B
# next(gen) をもう1回やると "end" 表示して StopIteration例外reSQLの場合
init_db("postgresql://user:password@localhost/dbname")
```

**初期化のタイミング:**

| アプリケーションタイプ | 初期化タイミング |
|---------------------|---------------|
| スクリプト | スクリプトの最初 |
| FastAPI | `@app.on_event("startup")` |
| テスト | `pytest` のfixtureで |

**FastAPIの場合の例:**

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

## セッション取得関数

### `get_session() -> Generator[Session, None, None]`

データベースセッションを取得する（コンテキストマネージャ対応）。自動コミットあり。

**戻り値:**

`Session` オブジェクトをyieldするジェネレータ。

**動作:**

1. withブロック開始時: セッションを作成
2. withブロック内: セッションをyield
3. withブロック終了時: 
   - 成功: `session.commit()` を実行
   - 例外発生: `session.rollback()` を実行
   - 必ず: `session.close()` を実行

**使用例:**

```python
from backend.db import get_session, NameCard

with get_session() as session:
    card = NameCard(first_name="太郎", last_name="山田")
    session.add(card)
    # ← withブロック終了時に自動コミット
```

**複数操作も1回のコミット:**

```python
with get_session() as session:
    # 3つ追加しても、withブロック終了時にまとめて1回コミット
    session.add(NameCard(first_name="太郎", last_name="山田"))
    session.add(NameCard(first_name="花子", last_name="佐藤"))
    session.add(NameCard(first_name="次郎", last_name="鈴木"))
```

---

### `get_db() -> Generator[Session, None, None]`

FastAPIのDependency Injection用。自動コミットなし。

**戻り値:**

`Session` オブジェクトをyieldするジェネレータ。

**動作:**

1. withブロック開始時: セッションを作成
2. withブロック内: セッションをyield
3. withブロック終了時: `session.close()` を実行（コミットは行わない）

**使用例（FastAPI）:**

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

**get_session() vs get_db():**

| 関数 | 自動コミット | 用途 |
|-----|------------|------|
| `get_session()` | ✅ あり | 通常のスクリプト・バッチ処理 |
| `get_db()` | ❌ なし | FastAPI（自分でcommit） |

---

## モデルクラス

### `NameCard`

名刺モデル（テーブル定義）。`Base` を継承。

**テーブル名:** `namecards`

**カラム:**

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| `id` | `int` | Yes | 主キー、自動採番 |
| `first_name` | `str` | Yes | 名 |
| `last_name` | `str` | Yes | 姓 |
| `first_name_kana` | `str` | Yes | 名（カナ） |
| `last_name_kana` | `str` | Yes | 姓（カナ） |
| `email` | `str \| None` | No | メールアドレス |
| `phone` | `str \| None` | No | 電話番号 |
| `company` | `str \| None` | No | 会社名 |
| `department` | `str \| None` | No | 部署 |
| `position` | `str \| None` | No | 役職 |
| `created_at` | `datetime` | Yes | 作成日時（自動設定） |
| `updated_at` | `datetime` | Yes | 更新日時（自動設定） |

**メソッド:**

#### `__repr__() -> str`

デバッグ用の文字列表現。

```python
card = NameCard(first_name="太郎", last_name="山田")
print(card)  # <NameCard(id=None, name=山田 太郎, company=None)>
```

#### `full_name() -> str`

フルネーム（姓 名）を返す。

```python
card = NameCard(first_name="太郎", last_name="山田")
print(card.full_name())  # "山田 太郎"
```

**使用例:**

```python
from backend.db import NameCard

# 作成
card = NameCard(
    first_name="太郎",
    last_name="山田",
    first_name_kana="たろう",
    last_name_kana="やまだ",
    email="taro@example.com",
    company="株式会社サンプル"
)
```

---

## リポジトリクラス

### `NameCardRepository`

名刺のCRUD操作を提供するリポジトリクラス。すべて静的メソッド。

#### `create(session, first_name: str, last_name: str, **kwargs) -> NameCard`

名刺を作成。

**引数:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `session` | `Session` | Yes | SQLAlchemyセッション |
| `first_name` | `str` | Yes | 名 |
| `last_name` | `str` | Yes | 姓 |
| `**kwargs` | - | No | その他のカラム（email, phone, company等） |

**戻り値:**

作成された `NameCard` オブジェクト（IDが設定済み）

**使用例:**

```python
from backend.db import get_session, NameCardRepository

with get_session() as session:
    card = NameCardRepository.create(
        session,
        first_name="太郎",
        last_name="山田",
        email="taro@example.com"
    )
    print(card.id)  # IDが既に設定されている
```

---

#### `get_by_id(session, card_id: int) -> NameCard | None`

IDで名刺を取得。

**引数:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `session` | `Session` | Yes | SQLAlchemyセッション |
| `card_id` | `int` | Yes | 取得する名刺のID |

**戻り値:**

`NameCard` オブジェクト、または見つからない場合は `None`

**使用例:**

```python
card = NameCardRepository.get_by_id(session, 1)
if card:
    print(card.full_name())
```

---

#### `get_all(session, skip: int = 0, limit: int = 100) -> list[NameCard]`

名刺一覧を取得（ページネーション対応）。

**引数:**

| 引数名 | 型 | 必須 | デフォルト | 説明 |
|-------|-----|------|-----------|------|
| `session` | `Session` | Yes | - | SQLAlchemyセッション |
| `skip` | `int` | No | 0 | スキップする件数 |
| `limit` | `int` | No | 100 | 取得する最大件数 |

**戻り値:**

`NameCard` オブジェクトのリスト

**使用例:**

```python
# 1ページ目（0-99件）
cards = NameCardRepository.get_all(session, skip=0, limit=100)

# 2ページ目（100-199件）
cards = NameCardRepository.get_all(session, skip=100, limit=100)
```

---

#### `search_by_name(session, query: str) -> list[NameCard]`

名前で検索（部分一致）。

**引数:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `session` | `Session` | Yes | SQLAlchemyセッション |
| `query` | `str` | Yes | 検索クエリ |

**戻り値:**

条件に一致する `NameCard` オブジェクトのリスト

**使用例:**

```python
# 姓または名に「山」を含む名刺を検索
results = NameCardRepository.search_by_name(session, "山")
```

---

#### `delete(session, card: NameCard) -> None`

名刺を削除。

**引数:**

| 引数名 | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `session` | `Session` | Yes | SQLAlchemyセッション |
| `card` | `NameCard` | Yes | 削除する名刺オブジェクト |

**使用例:**

```python
card = NameCardRepository.get_by_id(session, 1)
if card:
    NameCardRepository.delete(session, card)
    # sessionは自動コミットされる（get_session使用時）
```

---

## @contextmanager の仕組み

`@contextmanager` は関数を「コンテキストマネージャ」に変換するデコレータ。

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

**実行フロー:**

```python
with get_session() as session:     # [1]→[2] sessionが代入される
    session.add(card)              # ユーザーコード実行
# [2]の次から再開 → [3]または[4]が実行
```

**ポイント:**

- `yield` があると関数は「一時停止可能な関数（ジェネレータ）」になる
- `@contextmanager` が `yield` を使った関数を `with` 文で使えるように変換
- `with` 文は `__enter__` と `__exit__` メソッドを持つオブジェクトを期待する
- `@contextmanager` がこれらのメソッドを自動生成
