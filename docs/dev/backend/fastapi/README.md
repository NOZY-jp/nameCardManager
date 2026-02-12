# FastAPI クイックスタート

Python用の高速なWebフレームワーク。型ヒントによる自動バリデーション、自動ドキュメント生成が特徴。

## 概要

- **性能**: Flaskより高速（Starletteベース）
- **型安全性**: Python型ヒントによる自動バリデーション
- **ドキュメント**: 自動でOpenAPI/Swaggerドキュメント生成
- **エディタサポート**: 型ヒントによりIDEでの補完が強力

## 5秒で始める

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id}
```

**実行:**
```bash
uvicorn main:app --reload
```

**自動ドキュメント:**
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## ドキュメント構成

| ファイル | 内容 |
|---------|------|
| [api.md](api.md) | FastAPIの機能・デコレータ詳細リファレンス |
| [examples.md](examples.md) | 実用的なコード例集 |

## 主要概念

### HTTPメソッドデコレータ

| デコレータ | HTTPメソッド | 用途 |
|-----------|------------|------|
| `@app.get()` | GET | データ取得 |
| `@app.post()` | POST | データ作成 |
| `@app.put()` | PUT | データ更新（完全）|
| `@app.patch()` | PATCH | データ更新（部分）|
| `@app.delete()` | DELETE | データ削除 |

### パラメータの種類

| 種類 | 定義方法 | URL例 |
|-----|---------|-------|
| **パスパラメータ** | `{parameter}` in path | `/items/123` |
| **クエリパラメータ** | 関数引数 | `/items?skip=0&limit=10` |
| **リクエストボディ** | Pydanticモデル | POSTのJSONボディ |

### 最小構成の構成要素

```python
from fastapi import FastAPI

# 1. アプリインスタンス作成
app = FastAPI()

# 2. エンドポイント定義（デコレータ + 関数）
@app.get("/users/{user_id}")  # パスパラメータ
def get_user(
    user_id: int,                    # ← パスパラメータ（自動変換）
    include_details: bool = False    # ← クエリパラメータ（?include_details=true）
):
    return {"user_id": user_id}
```

## 重要なポイント

1. **型ヒント必須** - `int`, `str`, Pydanticモデル等で引数の型を指定
2. **自動バリデーション** - 型に合わないリクエストは自動で422エラー
3. **自動変換** - URLの文字列を自動でint等に変換
4. **自動ドキュメント** - 型ヒントからSwagger UIが自動生成

## トラブルシューティング

### TypeError: 'async_generator' object is not iterable

```python
# ❌ エラー
@app.get("/items")
async def get_items():
    return get_db()  # async generatorをreturnしている

# ✅ 修正
@app.get("/items")
async def get_items(db: Session = Depends(get_db)):
    return db.query(Item).all()
```

### Validation Error (422)

```python
# ❌ エラー：requiredパラメータにデフォルト値なし
@app.get("/search")
def search(q: str):  # qが必須だがデフォルトなし
    ...

# ✅ 修正1：デフォルト値を設定
@app.get("/search")
def search(q: str = ""):
    ...

# ✅ 修正2：必須パラメータとして明示
@app.get("/search")
def search(q: str = Query(..., min_length=1)):
    ...
```

## 参考リンク

- [FastAPI公式ドキュメント](https://fastapi.tiangolo.com/)
- [Starlette（FastAPIのベース）](https://www.starlette.io/)
- [Pydantic（バリデーション）](https://docs.pydantic.dev/)
