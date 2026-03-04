# OCR 環境変数エラー調査レポート

**作成日**: 2026-03-04
**ステータス**: 調査完了・未修正

---

## 1. 現象

OCR 機能（Gemini 2.5 Flash による名刺画像テキスト抽出）を利用するため `GEMINI_API_KEY` 環境変数を設定したが、実際に OCR を実行すると以下のエラーが発生する。

```
ModuleNotFoundError: No module named 'google.genai'
```

API キーの設定有無に関わらず、`google-genai` パッケージ自体が Docker コンテナ内にインストールされていないため、`import` の時点で失敗する。

---

## 2. 環境変数の設定状況

### 2.1 `docker-compose.yml` の現状

`docker-compose.yml` の backend サービスの `environment` セクションには `GEMINI_API_KEY` が**定義されていない**。

```yaml
# docker-compose.yml (L19-L36)
backend:
  build:
    context: ./backend
    target: dev
  ports:
    - "8000:8000"
  environment:
    - DATABASE_URL=postgresql://user:password@db:5432/myapp
    # GEMINI_API_KEY は未設定
```

### 2.2 `backend/app/core/config.py` の定義

`config.py` では `gemini_api_key` フィールドが定義済みで、デフォルト値は空文字列 `""`。
pydantic-settings により環境変数 `GEMINI_API_KEY` から自動的に読み込まれる設計になっている。

```python
# backend/app/core/config.py (L44-L47)
gemini_api_key: str = Field(
    default="",
    description="Gemini API キー",
)
```

**結論**: アプリケーションコード側の環境変数定義は正しい。`docker-compose.yml` への環境変数追加も必要だが、それだけではエラーは解消しない。

---

## 3. エラーの発生箇所と内容

### 3.1 発生箇所

**ファイル**: `backend/app/api/v1/endpoints/images.py`
**関数**: `process_image_ocr()` (L83-L159)

```python
# L101-L102
try:
    from google import genai  # type: ignore[import-untyped]
```

`process_image_ocr()` は API キーが設定されている場合のみ Gemini API を呼び出す設計（L91 で空チェック）。
API キーが設定されている状態で OCR を実行すると、L102 の `from google import genai` が実行され、パッケージが存在しないため `ModuleNotFoundError` が発生する。

### 3.2 エラーの挙動

- API キーが**未設定**（空文字列）の場合: L92-L99 でダミー結果を返すため、エラーは発生しない
- API キーが**設定済み**の場合: L102 で `ModuleNotFoundError` が発生 → L151 の `except Exception` でキャッチされ、ダミー結果が返される（ログに `"Gemini OCR failed"` が出力される）

つまり、現在の実装では **API キーを設定しても OCR が実際には動作せず、常にダミー結果が返る** という状態になる。

---

## 4. 根本原因

**`google-genai` パッケージが `backend/pyproject.toml` の `dependencies` に含まれていない。**

```toml
# backend/pyproject.toml (L1-L16) - 現在の依存関係
[project]
dependencies = [
  "fastapi[standard]",
  "sqlalchemy",
  "pydantic",
  "pydantic-settings",
  "psycopg2-binary",
  "alembic",
  "httpx",
  "passlib[bcrypt]",
  "PyJWT",
  "psycopg[binary]>=3.3.3",
  "bcrypt<5",
  "opencv-python-headless>=4.13.0.92",
  "pillow>=12.1.1",
]
# ↑ google-genai が存在しない
```

`images.py` で `from google import genai` を遅延インポートしているが、パッケージ自体がインストールされていないため、API キー設定後に初めて到達した時点で `ModuleNotFoundError` となる。

### 4.1 副次的な問題

`docker-compose.yml` に `GEMINI_API_KEY` の環境変数定義がないため、仮にパッケージを追加しても API キーがコンテナに渡らない。この問題も合わせて対処する必要がある。

---

## 5. 修正案

### 修正 A: `pyproject.toml` に `google-genai` を追加（必須）

**対象ファイル**: `backend/pyproject.toml`

```diff
 [project]
 dependencies = [
   "fastapi[standard]",
   "sqlalchemy",
   "pydantic",
   "pydantic-settings",
   "psycopg2-binary",
   "alembic",
   "httpx",
   "passlib[bcrypt]",
   "PyJWT",
   "psycopg[binary]>=3.3.3",
   "bcrypt<5",
   "opencv-python-headless>=4.13.0.92",
   "pillow>=12.1.1",
+  "google-genai>=1.0.0",
 ]
```

### 修正 B: `docker-compose.yml` に環境変数を追加（必須）

**対象ファイル**: `docker-compose.yml`

```diff
   backend:
     build:
       context: ./backend
       target: dev
     ports:
       - "8000:8000"
     environment:
       - DATABASE_URL=postgresql://user:password@db:5432/myapp
+      - GEMINI_API_KEY=${GEMINI_API_KEY}
```

ホストの環境変数 `GEMINI_API_KEY` または `.env` ファイルから値を渡す。

### 修正後のデプロイ手順

```bash
# 1. 環境変数を設定（.env ファイルまたはシェルで）
export GEMINI_API_KEY="your-api-key-here"

# 2. backend コンテナを再ビルド＆再起動
docker compose up -d --build backend
```

---

## 6. 修正対象ファイル一覧

| # | ファイル | 修正内容 | 必須 |
|---|---------|---------|------|
| 1 | `backend/pyproject.toml` | `google-genai>=1.0.0` を dependencies に追加 | Yes |
| 2 | `docker-compose.yml` | `GEMINI_API_KEY=${GEMINI_API_KEY}` を backend の environment に追加 | Yes |

---

## 7. 修正工数の見積もり

| 作業 | 工数 |
|-----|------|
| `pyproject.toml` の修正 | 1 分 |
| `docker-compose.yml` の修正 | 1 分 |
| `docker compose up -d --build backend` の実行 | 2-3 分（ビルド時間） |
| 動作確認（OCR エンドポイントのテスト） | 5 分 |
| **合計** | **約 10 分** |

**難易度**: Quick（コード変更は 2 行のみ）
