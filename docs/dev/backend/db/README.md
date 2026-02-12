# backend/db クイックスタート

名刺管理アプリのデータベース管理モジュール。SQLAlchemy ORM を使用。

## 概要

- **DBエンジン**: SQLAlchemy 2.0
- **DB種類**: SQLite（開発時）/ PostgreSQL（本番想定）
- **ORMスタイル**: SQLAlchemy 2.0（DeclarativeBase + Mapped構文）
- **セッション管理**: コンテキストマネージャによる自動管理

## 5秒で始める

```python
from backend.db import init_db, get_session, NameCard

# 1. 初期化（アプリ起動時に1回）
init_db("sqlite:///namecards.db")

# 2. データ作成
with get_session() as session:
    card = NameCard(
        first_name="太郎",
        last_name="山田",
        first_name_kana="たろう",
        last_name_kana="やまだ"
    )
    session.add(card)
# ← withブロック終了で自動コミット
```

## ドキュメント構成

| ファイル | 内容 |
|---------|------|
| [api.md](api.md) | 関数・クラスの詳細リファレンス |
| [examples.md](examples.md) | 実用的なコード例集 |

## 重要なポイント

1. **import時に初期化されない** - `init_db()` を呼ぶまでDB接続は行われない
2. **with文必須** - セッションは必ず `with` 文で取得する
3. **自動コミット** - `get_session()` はwithブロック終了時に自動コミット

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

### セッションを閉じ忘れる

```python
# ❌ 悪い例（接続リークの原因）
session = get_session()  # これはジェネレータ！

# ✅ 正しい例
with get_session() as session:
    ...
```

## 参考リンク

- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [FastAPI SQL Database](https://fastapi.tiangolo.com/tutorial/sql-databases/)
