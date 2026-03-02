# 名刺管理システム - 統合テストレポート

## 1. テスト概要

| 項目 | 内容 |
|------|------|
| **実施日** | 2026年3月2日 |
| **テスト環境** | Docker Compose (ローカル) |
| **フロントエンド** | Next.js 16.1.6 (App Router, Turbopack) - `localhost:3000` |
| **バックエンド** | FastAPI (Python) - `localhost:8000` |
| **データベース** | PostgreSQL (pg_bigm) - `localhost:5432` |
| **テスト手法** | curl (APIエンドポイント) + Playwright (E2Eブラウザテスト) |
| **テストユーザー** | `integration_test@example.com` / `testpassword123` |
| **テスター** | AI統合テストエージェント |

### サーバー稼働状況

```
✅ Backend  : http://localhost:8000/health → {"status":"ok","database":"ok"}
✅ Frontend : http://localhost:3000 → 307 → /login (正常リダイレクト)
✅ Database : PostgreSQL (via backend health check)
```

---

## 2. APIエンドポイントテスト結果 (curl)

### 2.1 認証 (auth)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| POST | `/api/v1/auth/register` | 201 | ✅ PASS | 新規ユーザー作成成功 |
| POST | `/api/v1/auth/register` (重複) | 400 | ✅ PASS | 重複メール拒否 |
| POST | `/api/v1/auth/login` (JSON) | 200 | ✅ PASS | JWTトークン返却 |
| GET | `/api/v1/auth/me` | 200 | ✅ PASS | ユーザー情報取得 |

### 2.2 名刺 (namecards)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| GET | `/api/v1/namecards` | 200 | ⚠️ WARN | 常に空リスト `[]` を返す（db.commit欠如） |
| POST | `/api/v1/namecards` | 201 | ⚠️ WARN | レスポンスは正常だがデータ未永続化 |
| GET | `/api/v1/namecards/{id}` | 404 | ❌ FAIL | 作成直後のIDでも見つからない |
| PATCH | `/api/v1/namecards/{id}` | 404 | ❌ FAIL | 同上 |
| DELETE | `/api/v1/namecards/{id}` | 404 | ❌ FAIL | 同上 |
| GET | `/api/v1/namecards/new` | 422 | ❌ FAIL | "new"をID(int)として解釈→バリデーションエラー |

### 2.3 検索 (search)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| GET | `/api/v1/search?q=` | 200 | ✅ PASS | 空クエリ→全件検索（ただしデータなし） |
| GET | `/api/v1/search?q=test` | 200 | ✅ PASS | 英語クエリ正常 |
| GET | `/api/v1/search?q=田中` | 400 | ❌ FAIL | "Invalid HTTP request received" |

### 2.4 タグ (tags)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| POST | `/api/v1/tags` | 201 | ✅ PASS | タグ作成成功・永続化確認 |
| GET | `/api/v1/tags` | 200 | ✅ PASS | 作成したタグが一覧に表示 |
| PATCH | `/api/v1/tags/{id}` | 200 | ✅ PASS | タグ名更新成功 |
| DELETE | `/api/v1/tags/{id}` | 204 | ✅ PASS | タグ削除成功 |

### 2.5 関係性 (relationships)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| POST | `/api/v1/relationships` | 201 | ⚠️ WARN | レスポンスは正常だがデータ未永続化 |
| GET | `/api/v1/relationships` | 200 | ⚠️ WARN | 常に空リスト |
| GET | `/api/v1/relationships/tree` | 200 | ⚠️ WARN | 常に空ツリー |
| GET | `/api/v1/relationships/{id}` | 404 | ❌ FAIL | 作成直後でも見つからない |
| DELETE | `/api/v1/relationships/{id}` | 404 | ❌ FAIL | 同上 |

### 2.6 エクスポート/インポート (export/import)

| メソッド | エンドポイント | ステータス | 結果 | 備考 |
|----------|---------------|-----------|------|------|
| GET | `/api/v1/export/json` | 200 | ✅ PASS | JSON形式でエクスポート（データなしのため空） |
| POST | `/api/v1/import/json` | 200 | ⚠️ WARN | レスポンス正常だがdb.commit欠如の可能性 |

### APIテストサマリー

| カテゴリ | PASS | WARN | FAIL | 合計 |
|----------|------|------|------|------|
| 認証 | 4 | 0 | 0 | 4 |
| 名刺 | 0 | 2 | 4 | 6 |
| 検索 | 2 | 0 | 1 | 3 |
| タグ | 4 | 0 | 0 | 4 |
| 関係性 | 0 | 3 | 2 | 5 |
| エクスポート/インポート | 1 | 1 | 0 | 2 |
| **合計** | **11** | **6** | **7** | **24** |

---

## 3. Playwright E2Eテスト結果

### 3.1 認証フロー

#### Test-01: ログインページ表示
- **結果**: ✅ PASS
- **確認事項**:
  - `/login` ページ正常表示
  - タイトル「ログイン」
  - メールアドレス・パスワード入力フォーム表示
  - 「ログイン」ボタン表示
  - 「新規登録」リンク表示

#### Test-02: ログイン成功フロー
- **結果**: ✅ PASS
- **確認事項**:
  - メールアドレス・パスワード入力 → ログインボタンクリック
  - `/namecards` にリダイレクト成功
  - 「ログインしました」トースト表示

#### Test-03: 新規登録ページ表示
- **結果**: ✅ PASS
- **確認事項**:
  - `/register` ページ正常表示
  - タイトル「新規登録」
  - 説明文「名刺管理アプリケーションのアカウントを作成」
  - メールアドレスフィールド (required, autocomplete="email")
  - パスワードフィールド (required, placeholder="8文字以上のパスワード", autocomplete="new-password")
  - 「アカウント作成」ボタン
  - 「ログイン」リンクで `/login` へ遷移
  - 認証ページ専用レイアウト（AuthLayout）- ヘッダーなしは正常

#### Test-04: ログアウト機能
- **結果**: ❌ FAIL (テスト不可)
- **理由**: ナビゲーションが完全に欠落しており、ログアウトボタンにアクセスできない
- **備考**: Header.tsxにはナビゲーションが実装されているはずだが、ハイドレーションエラーにより`<nav>`要素がDOMに存在しない

### 3.2 ナビゲーション

#### Test-05: ヘッダーナビゲーション
- **結果**: ❌ FAIL
- **確認事項**:
  - ヘッダーにはロゴ「名刺管理」とテーマ切替ボタン（Moon/Sunアイコン）のみ
  - **ナビゲーションリンクが完全に欠落**（名刺一覧、タグ管理、関係性管理、インポート/エクスポート、ヘルプ等）
  - ハンバーガーメニューも存在しない
  - ログアウトボタンも存在しない
- **根本原因**: next-themesのハイドレーションエラーによりナビゲーション要素がクライアントでマウントされない
- **スクリーンショット**: `docs/screenshots/test_01_namecards_after_login.png`

### 3.3 名刺管理

#### Test-06: 名刺一覧ページ (`/namecards`)
- **結果**: ⚠️ PARTIAL
- **確認事項**:
  - SSR: スケルトンローダー6個を表示 ✅
  - クライアント: 「名刺がありません」の空状態を表示 ✅ (db.commitバグのためデータなし)
  - 新規作成ボタン: なし ❌
  - ナビゲーションリンク: なし ❌
  - ハイドレーションエラー: 1件 ❌
  - Next.js Dev Tools: 0 errors, 1 issue

#### Test-07: 名刺作成ページ (`/namecards/new`)
- **結果**: ❌ FAIL
- **確認事項**:
  - 「読み込み中...」のまま永久に停止
  - **5つのコンソールエラー**:
    1. ハイドレーションエラー (next-themes)
    2. `GET /api/v1/namecards/new` → 422 Unprocessable Entity (2回)
    3. AxiosError: Request failed with status code 422 (2回)
  - Next.js Dev Tools: Issues 1+2
- **根本原因**: フロントエンドのルーティングが `/namecards/new` をアクセスすると、バックエンドの `/api/v1/namecards/{id}` に "new" を ID として送信。FastAPIがintバリデーションに失敗して422を返す
- **スクリーンショット**: `docs/screenshots/test_02_namecards_new_broken.png`

### 3.4 タグ管理

#### Test-08: タグ管理ページ (`/tags`)
- **結果**: ✅ PASS (機能的に正常)
- **確認事項**:
  - ページ正常表示 ✅
  - 既存タグ表示（curlテストで作成した「updated-tag」） ✅
  - 削除ボタン ✅
  - 新しいタグ追加フォーム ✅
  - **タグ追加操作テスト**: 「テスト用タグ」入力→追加→リストに正常反映 ✅
  - データ永続化確認: ✅ (tags.pyはdb.commit()使用)
  - ハイドレーションエラー: 1件 ❌
  - ナビゲーションなし ❌

### 3.5 関係性管理

#### Test-09: 関係性管理ページ (`/relationships`)
- **結果**: ⚠️ PARTIAL (UI表示は正常、データ保存不可)
- **確認事項**:
  - ページ正常表示 ✅
  - 空状態「所属・関係性がありません」表示 ✅
  - 追加ボタン ✅ → クリックでフォーム表示 ✅
  - **ノード追加操作テスト**: 「株式会社テスト」入力→追加→POST 201→GET 200(空リスト)→**データ未反映** ❌
  - ネットワーク: POST→201 Created → GET→200 `[]` (db.commitバグ再現)
  - ハイドレーションエラー: 1件 ❌

### 3.6 インポート/エクスポート

#### Test-10: インポート/エクスポートページ (`/import-export`)
- **結果**: ⚠️ PARTIAL
- **確認事項**:
  - ページ正常表示 ✅
  - エクスポートセクション: 説明文 + エクスポートボタン ✅
  - インポートセクション: **インポートボタンが2つ表示** ⚠️ (hidden属性のファイル選択input + visible なボタン - UIバグの可能性)
  - ハイドレーションエラー: 1件 ❌
- **スクリーンショット**: `docs/screenshots/test_03_import_export.png`

### 3.7 ヘルプ

#### Test-11: ヘルプページ (`/help`)
- **結果**: ✅ PASS
- **確認事項**:
  - 「使い方ガイド」ページ正常表示 ✅
  - 全セクション正常表示:
    - 名刺の登録 ✅
    - 名刺の検索 ✅
    - 所属・関係性の管理 ✅
    - タグの管理 ✅
    - データのエクスポート/インポート ✅
    - 連絡先 ✅
  - ハイドレーションエラー: 1件 ❌

### 3.8 ハイドレーションエラー（全ページ共通）

#### Test-12: ハイドレーションエラー詳細分析
- **結果**: ❌ FAIL (全ページで再現)
- **影響ページ**: `/namecards`, `/namecards/new`, `/tags`, `/relationships`, `/import-export`, `/help`
- **影響なしページ**: `/login`, `/register` (認証レイアウトにはテーマ切替ボタンなし)
- **根本原因**:
  - `next-themes` のテーマ切替アイコンがSSRとクライアントで不一致
  - **サーバー**: `<svg class="lucide lucide-moon">` (Moon アイコン) をレンダリング
  - **クライアント**: `<svg class="lucide lucide-sun">` (Sun アイコン) をレンダリング
  - HTMLミスマッチ → React ハイドレーション失敗
  - ナビゲーション要素がクライアントでマウントされない原因となっている可能性が高い

### E2Eテストサマリー

| テスト | ページ | 結果 |
|--------|--------|------|
| Test-01 | `/login` 表示 | ✅ PASS |
| Test-02 | ログイン成功 | ✅ PASS |
| Test-03 | `/register` 表示 | ✅ PASS |
| Test-04 | ログアウト | ❌ FAIL |
| Test-05 | ナビゲーション | ❌ FAIL |
| Test-06 | `/namecards` 一覧 | ⚠️ PARTIAL |
| Test-07 | `/namecards/new` 作成 | ❌ FAIL |
| Test-08 | `/tags` タグ管理 | ✅ PASS |
| Test-09 | `/relationships` 関係性 | ⚠️ PARTIAL |
| Test-10 | `/import-export` | ⚠️ PARTIAL |
| Test-11 | `/help` ヘルプ | ✅ PASS |
| Test-12 | ハイドレーション | ❌ FAIL |

| 結果 | 件数 |
|------|------|
| ✅ PASS | 5 |
| ⚠️ PARTIAL | 3 |
| ❌ FAIL | 4 |

---

## 4. 発見されたバグ一覧

### 🔴 Critical（緊急 - アプリケーションの基本機能が使用不能）

#### BUG-001: 名刺データが永続化されない（db.flush() vs db.commit() 問題）
- **カテゴリ**: バックエンド / データベース
- **優先度**: 🔴 Critical
- **影響範囲**: 名刺CRUD全操作
- **ファイル**: `backend/app/api/v1/endpoints/namecards.py`
- **原因**: `db.flush()` のみ使用し `db.commit()` を呼んでいない。`database.py` の `get_db()` も `db.close()` のみで commit しない。
- **再現手順**:
  1. `POST /api/v1/namecards` で名刺を作成（201 Created が返る）
  2. `GET /api/v1/namecards` で一覧取得
  3. → 常に `[]` が返り、作成したデータが存在しない
- **影響**: 名刺の作成・更新・削除がすべて機能しない。アプリケーションの核心機能が完全に壊れている。

#### BUG-002: 関係性データが永続化されない
- **カテゴリ**: バックエンド / データベース
- **優先度**: 🔴 Critical
- **影響範囲**: 関係性CRUD全操作
- **ファイル**: `backend/app/api/v1/endpoints/relationships.py`
- **原因**: BUG-001と同一（db.flush() のみ、db.commit() なし）
- **再現手順**:
  1. `POST /api/v1/relationships` でノード作成（201 Created）
  2. `GET /api/v1/relationships` で一覧取得
  3. → 常に `[]`

#### BUG-003: インポートデータが永続化されない
- **カテゴリ**: バックエンド / データベース
- **優先度**: 🔴 Critical
- **影響範囲**: データインポート機能
- **ファイル**: `backend/app/api/v1/endpoints/import_.py`
- **原因**: BUG-001と同一（db.flush() のみ、db.commit() なし）

#### BUG-004: `/namecards/new` ページが完全に壊れている
- **カテゴリ**: フロントエンド / ルーティング + バックエンド / APIルーティング
- **優先度**: 🔴 Critical
- **影響範囲**: 名刺新規作成画面
- **原因**: フロントエンドが `/namecards/new` にアクセスすると、何らかの理由で `GET /api/v1/namecards/new` をバックエンドに送信。FastAPI側で `"new"` を整数型のIDパラメータとしてバリデーションし 422 エラーを返す。
- **再現手順**:
  1. ログイン後、ブラウザで `http://localhost:3000/namecards/new` にアクセス
  2. → 「読み込み中...」のまま停止
  3. コンソールに 422 エラーが2回、AxiosError が2回表示
- **スクリーンショット**: `docs/screenshots/test_02_namecards_new_broken.png`

### 🟠 High（重要 - ユーザー体験に大きな影響）

#### BUG-005: ナビゲーションが完全に欠落している
- **カテゴリ**: フロントエンド / レイアウト
- **優先度**: 🟠 High
- **影響範囲**: 全メインページ（`/namecards`, `/tags`, `/relationships`, `/import-export`, `/help`）
- **原因**: `Header.tsx` コンポーネントのSSRレンダリング結果に `<nav>` 要素が含まれていない。ハイドレーションエラー (BUG-007) との関連が疑われるが、SSR段階で既にナビゲーションが欠落しているため、コンポーネント実装自体の問題の可能性もある。
- **再現手順**:
  1. ログイン後、任意のメインページにアクセス
  2. → ヘッダーにはロゴ「名刺管理」とテーマ切替ボタンのみ表示
  3. → ページ間の遷移手段がない（URLを直接入力するしかない）
- **SSR HTML確認**: `<header>` 内に `<a class="brand" href="/">名刺管理</a>` と `<button aria-label="テーマ切替">` のみ。`<nav>` 要素なし。
- **スクリーンショット**: `docs/screenshots/test_01_namecards_after_login.png`

#### BUG-006: ログアウト機能にアクセスできない
- **カテゴリ**: フロントエンド / レイアウト
- **優先度**: 🟠 High
- **影響範囲**: ユーザーセッション管理
- **原因**: BUG-005（ナビゲーション欠落）の派生問題。ログアウトボタンがナビゲーション内に配置されているため、アクセス不可。
- **再現手順**: ログイン後、ログアウト手段がない

#### BUG-007: 全ページでハイドレーションエラーが発生
- **カテゴリ**: フロントエンド / SSR
- **優先度**: 🟠 High
- **影響範囲**: テーマ切替ボタンを含む全メインページ
- **ファイル**: `Header.tsx` 内のテーマ切替ボタン（next-themes使用）
- **原因**: `next-themes` のテーマ状態がSSRとクライアントで異なるため、テーマ切替アイコンが不一致。
  - サーバー: `<svg class="lucide lucide-moon">` をレンダリング
  - クライアント: `<svg class="lucide lucide-sun">` をレンダリング
  - → HTMLミスマッチ → React ハイドレーション失敗
- **修正方針**: テーマ切替ボタンを `mounted` state で制御するか、`dynamic import` で `ssr: false` にする

### 🟡 Medium（中程度 - 特定機能への影響）

#### BUG-008: 日本語検索クエリで400エラー
- **カテゴリ**: バックエンド / 検索
- **優先度**: 🟡 Medium
- **影響範囲**: 日本語名による名刺検索
- **原因**: URLエンコーディングまたはUvicorn/FastAPIの日本語パラメータ処理の問題
- **再現手順**:
  1. `GET /api/v1/search?q=田中` を送信
  2. → 400 Bad Request: "Invalid HTTP request received"
  3. 英語クエリ（`?q=test`）は正常動作
- **備考**: 日本語のみのアプリケーションであるため、この問題の影響は大きい

#### BUG-009: 名刺一覧ページに新規作成ボタンがない
- **カテゴリ**: フロントエンド / UI
- **優先度**: 🟡 Medium
- **影響範囲**: 名刺新規作成への導線
- **原因**: `/namecards` ページのUIに新規作成ボタンが実装されていない。ナビゲーション欠落 (BUG-005) と合わせて、名刺作成画面への導線が完全に断たれている。

### 🟢 Low（低 - 軽微なUI問題）

#### BUG-010: インポートページにボタンが2つ表示される
- **カテゴリ**: フロントエンド / UI
- **優先度**: 🟢 Low
- **影響範囲**: `/import-export` ページ
- **原因**: ファイル選択用の `<input type="file" hidden>` とトリガー用の `<button>` が両方表示されている可能性。`hidden` 属性が正しく機能していない。
- **スクリーンショット**: `docs/screenshots/test_03_import_export.png`

---

## 5. 根本原因分析: db.commit() 欠如問題

### 影響範囲マトリクス

| ファイル | flush() 回数 | commit() 回数 | 永続化 | 備考 |
|----------|-------------|--------------|--------|------|
| `auth.py` | 0 | 1 | ✅ 正常 | |
| `tags.py` | 0 | 3 | ✅ 正常 | |
| **`namecards.py`** | **6** | **0** | **❌ 不可** | 全CRUD操作が影響 |
| **`relationships.py`** | **3** | **0** | **❌ 不可** | 全CRUD操作が影響 |
| **`import_.py`** | **5** | **0** | **❌ 不可** | インポート処理全体が影響 |
| `export.py` | 0 | 0 | N/A | 読み取り専用 |
| `search.py` | 0 | 0 | N/A | 読み取り専用 |

### 技術的詳細

`backend/app/core/database.py` の `get_db()`:
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()  # ← commit() なしで close() のみ
```

`SessionLocal` は `autocommit=False` で作成されているため、明示的に `db.commit()` を呼ばないとトランザクションはロールバックされる。

`db.flush()` はSQL文をデータベースに送信するが、トランザクションはコミットしない。そのため：
1. POST リクエスト → `db.flush()` → データベースにINSERT文が送信される → IDが割り当てられる → レスポンスにIDが含まれる（201 Created）
2. リクエスト終了 → `db.close()` → トランザクションがロールバックされる → データが消える
3. 次のGETリクエスト → 新しいセッション → データが存在しない

---

## 6. 推奨される修正順序

### Phase 1: データ永続化の修正（最優先）

**修正1-A: `database.py` の `get_db()` にコミット処理を追加**

推奨される修正（2通り）:

**方法A**: get_db() でauto-commitを実装
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()  # 正常終了時にコミット
    except Exception:
        db.rollback()  # エラー時にロールバック
        raise
    finally:
        db.close()
```

**方法B**: 各エンドポイントの `db.flush()` を `db.commit()` に置換
- `namecards.py`: 6箇所
- `relationships.py`: 3箇所
- `import_.py`: 5箇所

→ **方法Aを推奨**（一箇所の修正で全エンドポイントに適用され、今後の新規エンドポイントでもcommit忘れを防げる）

**影響**: BUG-001, BUG-002, BUG-003 が同時に解決

### Phase 2: フロントエンドのハイドレーション修正

**修正2-A: テーマ切替ボタンのSSR対応**

`Header.tsx` のテーマ切替ボタンを、クライアントサイドでのみレンダリングするように修正:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

// テーマ切替ボタンのレンダリング
{mounted ? (
  <button onClick={toggleTheme}>
    {theme === 'dark' ? <Sun /> : <Moon />}
  </button>
) : (
  <button aria-label="テーマ切替">
    <div style={{ width: 18, height: 18 }} /> {/* プレースホルダー */}
  </button>
)}
```

**影響**: BUG-007 が解決。BUG-005（ナビゲーション欠落）も解決する可能性が高い。

### Phase 3: ルーティングの修正

**修正3-A: `/namecards/new` ルーティング問題**

2つのアプローチ:

1. **フロントエンド**: `/namecards/new` ページコンポーネントが不要なAPI呼び出し（`GET /api/v1/namecards/new`）をしないように修正
2. **バックエンド**: `/api/v1/namecards/new` を `/api/v1/namecards/{id}` より先にルート定義するか、パスパラメータのバリデーションを改善

**影響**: BUG-004 が解決

### Phase 4: ナビゲーション・UI修正

**修正4-A**: Phase 2 で BUG-005 が解決しない場合、Header.tsx のナビゲーション実装を確認・修正

**修正4-B**: `/namecards` ページに「新規作成」ボタンを追加

**影響**: BUG-005, BUG-006, BUG-009 が解決

### Phase 5: 検索・その他の修正

**修正5-A**: 日本語検索クエリの問題を調査・修正（URLエンコーディング or Uvicorn設定）

**修正5-B**: インポートページのボタン重複を修正

**影響**: BUG-008, BUG-010 が解決

### 修正優先度マトリクス

| 修正 | 対象バグ | 難易度 | 影響度 | 推奨順 |
|------|---------|--------|--------|--------|
| 1-A: db.commit() | BUG-001,002,003 | 低 | 極大 | **1番目** |
| 2-A: ハイドレーション | BUG-007,(005,006) | 中 | 大 | **2番目** |
| 3-A: ルーティング | BUG-004 | 中 | 大 | **3番目** |
| 4-A: ナビゲーション | BUG-005,006,009 | 中 | 大 | **4番目** |
| 5-A: 日本語検索 | BUG-008 | 低〜中 | 中 | **5番目** |
| 5-B: ボタン重複 | BUG-010 | 低 | 低 | **6番目** |

---

## 7. スクリーンショット一覧

| ファイル | 内容 |
|----------|------|
| `docs/screenshots/test_01_namecards_after_login.png` | ログイン後の名刺一覧ページ（ナビゲーション欠落確認） |
| `docs/screenshots/test_02_namecards_new_broken.png` | `/namecards/new` 読み込み停止状態 |
| `docs/screenshots/test_03_import_export.png` | インポート/エクスポートページ |

---

## 8. 結論

名刺管理システムの統合テストにおいて、**10件のバグ**を発見しました。

最も深刻な問題は **データベーストランザクションのコミット漏れ**（BUG-001〜003）で、名刺・関係性・インポートの全データが永続化されません。これは `database.py` の `get_db()` 関数1箇所を修正することで3件同時に解決可能です。

次に深刻なのは **ハイドレーションエラー**（BUG-007）で、これがナビゲーション欠落（BUG-005,006）の原因である可能性が高いです。`next-themes` のテーマ切替ボタンをSSR対応にすることで解決見込みです。

**修正1箇所（database.py）+ 修正1箇所（Header.tsx）で、10件中6〜8件のバグが解決する可能性があります。**

---

*レポート作成: AI統合テストエージェント*
*レポート日時: 2026年3月2日*
