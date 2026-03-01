# 名刺管理アプリ Phase 1 実装計画

## TL;DR

> **Quick Summary**: 名刺管理アプリの MVP を構築する。OCR（Gemini 2.5 Flash）、画像処理（四隅選択+遠近補正）、検索（pg_bigm）、JSON入出力を含むフルスタック実装。テストファースト開発。
>
> **Deliverables**:
> - バックエンド: FastAPI（CRUD API、検索API、画像処理API、JSON API）
> - フロントエンド: Next.js + shadcn/ui + SCSS（ダークモード対応）
> - CI/CD: GitHub Actions
> - テスト: pytest（バックエンド）+ Vitest/Playwright（フロントエンド）
>
> **Estimated Effort**: Large（3〜4週間 × 2（BE/FE並行））
> **Parallel Execution**: YES - 2 waves（BE/FE）
> **Critical Path**: API設計 → テスト作成 → バックエンド実装 → フロントエンド実装 → 統合

---

## Context

### Original Request
名刺管理アプリ（個人用・小規模）を段階的に実装する。Phase 1 では MVP として以下を実現：
- 名刺データの CRUD
- OCR による名刺情報自動抽出
- 画像処理（四隅選択、遠近補正）
- 検索機能
- JSON エクスポート/インポート

### Interview Summary

**技術スタック決定:**
| カテゴリ | 決定内容 |
|---------|---------|
| OCR | Gemini 2.5 Flash |
| 画像処理 | 四隅選択UI（フロント）+ OpenCV遠近補正（バックエンド） |
| 画像保存 | ローカルファイルシステム（Docker Volume）+ WebP |
| 検索 | pg_bigm（GIN インデックス） |
| フロントエンド | Next.js + **shadcn/ui** + **SCSS**（⛔ Tailwind 禁止） |
| FE レンダリング | **SSR** + **App Router** |
| FE ディレクトリ | **src/** 配下（app/, components/, lib/, hooks/, styles/） |
| FE 状態管理 | **Context API**（AuthContext, ToastContext）、ダークモードは **next-themes** |
| FE フォーム | **React Hook Form** + **Zod** + **@hookform/resolvers** |
| FE API クライアント | **axios**（JWT インターセプター） |
| FE 名刺編集 | **モーダル方式**（NameCardEditDialog）、編集専用ルートなし |
| ダークモード | **next-themes** + `html.dark` セレクター + SCSS 変数 |
| デプロイ | VPS（自前管理） |
| CI/CD | GitHub Actions（Phase 1 から） |
| Python | 3.14（CI は Docker コンテナ） |
| Gemini SDK | `google-genai`（`google-generativeai` は非推奨） |
| DB ドライバ | `psycopg[binary]` v3（`psycopg2-binary` から移行） |
| 画像処理 | `opencv-python-headless`, `Pillow` |
| テスト | `pytest`, `pytest-asyncio`, `httpx` |
| 国際化 | 日本語のみ |

> 📎 依存パッケージの詳細バージョンは [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野9 を参照

**データモデル決定:**
| モデル | 役割 | 関係 |
|-------|------|------|
| Relationship | 組織階層（建築士会/桑名支部/青年会長） | M:N（兼務対応） |
| Tag | フラット分類ラベル（ゴルフ仲間、友人） | M:N |
| ContactMethod | 連絡先（email, phone, fax 等）、label 廃止・type は enum 17種 | 1:N |
| NameCard | 名刺本体 | met_notes（出会い情報）のみ |

**テスト戦略:**
- **テストファースト**: テストを先に完成させる
- テストが通るように実装を進める
- テストの改変はユーザー確認必須

**制限事項:**
- 画像アップロード上限: 20MB
- 名刺枚数上限: なし

**実装上の注意事項:**
- `backend/app/api.py` に以下のルーターを追加登録する必要あり（[NC-4](../../docs/plans/momus.md)）:
  - `relationships`, `tags`, `export`, `import_router`（`import` は Python 予約語のため別名）
- `pyproject.toml` の `python_files` を `["test_*.py"]` に変更（[NC-3](../../docs/plans/momus.md)）
- SQLAlchemy 接続文字列を `postgresql+psycopg://` に変更（[NC-14](../../docs/plans/momus.md)）

### Research Findings

**OCR エンジン比較:**
| エンジン | 月額コスト | 日本語精度 | 推奨 |
|---------|-----------|-----------|------|
| Gemini 2.5 Flash | ~¥6 | ⭐⭐⭐⭐⭐ | ✅ |
| GPT-4o mini | ~¥60 | ⭐⭐⭐⭐⭐ | |
| Claude 3.5 Sonnet | ~¥150 | ⭐⭐⭐⭐ | |

**画像処理フロー（2段階アップロード）:**
1. `POST /api/v1/images/upload` → 画像保存（一時）、`upload_id` 発行、OCR 非同期開始
2. フロントで四隅選択 UI 表示（OCR 並行実行中）
3. `POST /api/v1/images/process` → 四隅座標送信、OCR 完了待ち（最大10秒）→ 遠近補正・WebP 変換
4. レスポンス: `{ ocr_result, image_path, thumbnail_path }`

> 📎 詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野6 を参照

---

## Work Objectives

### Core Objective
名刺管理アプリの MVP を完成させ、OCR による名刺情報自動抽出と検索機能を提供する。

### Concrete Deliverables

> 📎 全エンドポイントの詳細仕様（リクエスト/レスポンス形式、ステータスコード等）は [`docs/plans/momus.md`](../../docs/plans/momus.md) を参照

**バックエンド（FastAPI）:**
- `/api/v1/namecards` - 名刺 CRUD API
- `/api/v1/relationships` - 組織階層 CRUD API
- `/api/v1/tags` - タグ CRUD API
- `/api/v1/search` - 検索 API（pg_bigm）
- `/api/v1/images` - 画像処理 API（アップロード、OCR、遠近補正）
- `/api/v1/export/json` - JSON エクスポート
- `/api/v1/import/json` - JSON インポート

**フロントエンド（Next.js SSR + App Router）:**
- `(auth)/login`, `(auth)/register` - ログイン/登録画面
- `(main)/` - 名刺一覧画面（NameCardList, NameCardItem）
- `(main)/namecards/[id]` - 名刺詳細画面（NameCardDetail）+ モーダル編集（NameCardEditDialog）
- `(main)/namecards/new` - 名刺登録（NameCardForm）
- カメラ撮影（CameraCapture）+ 四隅選択（CornerSelector）+ OCR
- `(main)/relationships` - 組織階層管理画面（RelationshipTree）
- `(main)/tags` - タグ管理画面（TagList）
- SearchBar - 検索 UI
- `(main)/import-export` - JSON エクスポート/インポート UI
- `(main)/help` - ヘルプページ

**CI/CD:**
- `.github/workflows/ci.yml` - 自動テスト・リント

### Definition of Done
- [ ] 全テスト（ユニット + 統合 + E2E）がグリーン
- [ ] GitHub Actions CI で全テストが自動実行される
- [ ] `docker compose up` でフロント + バック + DB が正常起動
- [ ] OpenAPI ドキュメントで全エンドポイントが確認可能
- [ ] ダークモードが動作する
- [ ] モバイル/デスクトップでレスポンシブ対応

### Must Have
- OCR 機能（Gemini 2.5 Flash）
- 四隅選択 UI + 遠近補正
- pg_bigm 検索
- JSON エクスポート/インポート
- shadcn/ui + SCSS での UI 構築
- テストファースト開発

### Must NOT Have (Guardrails)
- ⛔ **Tailwind CSS は絶対に使用しない**
- ⛔ テストコードを勝手に改変しない（ユーザー確認必須）
- ⛔ 画像の元データを保存しない（補正後のみ）
- ⛔ met_at, met_context カラムは追加しない（met_notes のみ）
- ⛔ company_name, department, position カラムは追加しない（Relationship で表現）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES（pytest, Vitest, Playwright）
- **Automated tests**: YES（TDD）
- **Framework**: pytest（バックエンド）+ Vitest + Playwright（フロントエンド）

### Agent-Executed QA Scenarios (MANDATORY)

**シナリオ 1: 名刺 OCR 登録フロー**
```
Scenario: カメラで名刺を撮影して OCR 登録
  Tool: Playwright (playwright skill)
  Preconditions: ログイン済み、Gemini API キー設定済み
  Steps:
    1. Navigate to: http://localhost:3000/namecards/new
    2. Click: button[data-testid="camera-button"]
    3. Wait for: カメラ許可ダイアログ → 許可
    4. Assert: カメラガイド枠（名刺サイズ）が表示される
    5. Capture: 名刺画像を撮影
    6. Wait for: 四隅選択 UI が表示される（timeout: 5s）
    7. Assert: デフォルト四隅が枠の頂点に設定されている
    8. Drag: 四隅を名刺の角に合わせる
    9. Click: button[data-testid="confirm-corners"]
    10. Wait for: OCR 結果がフォームにプリフィルされる（timeout: 10s）
    11. Assert: 氏名、会社、メール等が入力されている
    12. Click: button[type="submit"]
    13. Wait for: 名刺詳細ページに遷移（timeout: 5s）
    14. Assert: h1 に名刺の氏名が含まれる
    15. Screenshot: .sisyphus/evidence/ocr-registration-flow.png
  Expected Result: 名刺が OCR 経由で正常に登録される
  Evidence: .sisyphus/evidence/ocr-registration-flow.png
```

**シナリオ 2: 検索機能**
```
Scenario: 日本語部分一致検索
  Tool: Playwright (playwright skill)
  Preconditions: ログイン済み、名刺データが存在
  Steps:
    1. Navigate to: http://localhost:3000/namecards
    2. Fill: input[data-testid="search-input"] → "田中"
    3. Wait for: 検索結果が更新される（debounce 300ms + API応答）
    4. Assert: 検索結果に "田中" を含む名刺が表示される
    5. Assert: 検索結果件数が正しい
    6. Screenshot: .sisyphus/evidence/search-partial-match.png
  Expected Result: 日本語部分一致で名刺が検索される
  Evidence: .sisyphus/evidence/search-partial-match.png
```

**シナリオ 3: JSON エクスポート**
```
Scenario: JSON ファイルダウンロード
  Tool: Bash (curl)
  Preconditions: サーバー起動中、認証トークン取得済み
  Steps:
    1. curl -s -H "Authorization: Bearer $TOKEN" \
         -o /tmp/namecards.json \
         http://localhost:8000/api/v1/export/json
    2. Assert: HTTP status is 200
    3. Assert: Content-Type is application/json
    4. Assert: JSON に "exported_at", "version", "namecards" キーが含まれる
    5. Assert: namecards 配列に contact_methods がネストされている
  Expected Result: JSON ファイルが正常にダウンロードされる
  Evidence: /tmp/namecards.json
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1（API設計・テスト先行）:
├── 1-BE-1: Alembic + スキーマ確定
├── 1-BE-2: Pydantic スキーマ定義
└── 1-BE-TEST: 全エンドポイントのテスト作成

Wave 2（バックエンド・フロントエンド並行）:
├── 1-BE-3〜8: バックエンド実装（テストが通るように）
└── 1-FE-1〜7: フロントエンド実装（モック API 使用）

Wave 3（統合・CI）:
└── GitHub Actions CI 設定
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1-BE-1（Alembic） | なし | 1-BE-2, 1-BE-3 |
| 1-BE-2（スキーマ） | 1-BE-1 | 1-BE-TEST, 1-FE-1 |
| 1-BE-TEST（テスト） | 1-BE-2 | 1-BE-3〜8 |
| 1-BE-3〜8（実装） | 1-BE-TEST | Wave 3 |
| 1-FE-1〜7（フロント） | 1-BE-2 | Wave 3 |
| GitHub Actions | 1-BE-TEST | なし |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agent |
|------|-------|-------------------|
| 1 | 1-BE-1, 1-BE-2 | task(category="ultrabrain") |
| 1 | 1-BE-TEST | task(category="ultrabrain") |
| 2 | 1-BE-3〜8 | task(category="ultrabrain") |
| 2 | 1-FE-1〜7 | task(category="visual-engineering", load_skills=["frontend-ui-ux"]) |
| 3 | CI | task(category="quick") |

---

## TODOs

### Wave 1: API設計・テスト先行

- [ ] 1. Alembic 導入 + DB マイグレーション基盤

  **What to do**:
  - Alembic 初期化
  - 既存スキーマの initial マイグレーション生成
  - pg_bigm 拡張の有効化
  - GIN インデックス作成
  - `ALTER TABLE contact_methods DROP COLUMN label`（ContactMethod.label 廃止: [NC-2](../../docs/plans/momus.md)）
  - pg_bigm 用カスタム Dockerfile 作成（`docker/postgres/Dockerfile`）

  > 📎 pg_bigm Dockerfile の詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野9 を参照

  **Must NOT do**:
  - 既存の models/__init__.py を変更しない（マイグレーション生成のみ）

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: NO（最初のタスク）
  - Blocks: 1-BE-2, 1-BE-3

  **Acceptance Criteria**:
  - [ ] `alembic upgrade head` で空 DB にスキーマが作成される
  - [ ] `alembic downgrade base` → `alembic upgrade head` が冪等に動作する
  - [ ] pg_bigm 拡張が有効化される
  - [ ] カスタム Dockerfile で pg_bigm がビルドされる
  - [ ] docker-compose.yml に `shared_preload_libraries=pg_bigm` が設定される
  - [ ] contact_methods テーブルから label カラムが削除される

  **Commit**: YES
  - Message: `chore(db): add alembic, pg_bigm extension, and drop contact_methods.label`
  - Files: `alembic/`, `alembic.ini`, `docker-compose.yml`, `docker/postgres/Dockerfile`

---

- [ ] 2. Pydantic スキーマ定義

  **What to do**:
  - NameCard, Relationship, Tag, ContactMethod の Request/Response スキーマを定義
  - 検索リクエスト/レスポンススキーマを定義
  - バリデーションルールの実装
  - ContactMethod スキーマから `label` フィールドを除外（[NC-2](../../docs/plans/momus.md)）
  - ContactMethod.type を enum（17種類）で定義（[NC-2](../../docs/plans/momus.md)）

  > 📎 フィールド定義の詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野1〜6 を参照

  **Must NOT do**:
  - ⛔ 既存の認証スキーマ（CurrentUser, UserCreate 等）を変更しない
  - ⛔ ContactMethod に `label` フィールドを含めない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: NO（1-BE-1 に依存）
  - Blocks: 1-BE-TEST, 1-FE-1

  **References**:
  - `backend/app/schemas/__init__.py` - 既存スキーマ
  - `backend/app/models/__init__.py` - ORM モデル定義

  **Acceptance Criteria**:
  - [ ] NameCardCreate, NameCardUpdate, NameCardResponse, NameCardListResponse
  - [ ] RelationshipCreate, RelationshipResponse, RelationshipTreeResponse
  - [ ] TagCreate, TagUpdate, TagResponse
  - [ ] ContactMethodCreate, ContactMethodResponse
  - [ ] SearchRequest, SearchResponse
  - [ ] バリデーションのユニットテスト

  **Commit**: YES
  - Message: `feat(schemas): add namecard, relationship, tag, contact schemas`
  - Files: `backend/app/schemas/__init__.py`

---

- [ ] 3. 全エンドポイントのテスト作成（テストファースト）

  **What to do**:
  - 名刺 CRUD テスト
  - 組織階層 CRUD テスト
  - タグ CRUD テスト
  - 検索テスト
  - 画像処理テスト（モック使用）
  - JSON エクスポート/インポートテスト
  - 認証テスト
  - Health テスト

  > 📎 **165件のテストケース定義**: [`docs/plans/backend_test_cases.md`](../../docs/plans/backend_test_cases.md) に全テストケースを記載済み
  > 📎 **テスト fixture 設計**: [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野8 の共通 Fixture 表を参照
  > ⚠️ pytest ファイル命名は `test_*.py` 形式（[NC-3](../../docs/plans/momus.md)）

  **Must NOT do**:
  - ⛔ テスト作成後にテストを変更しない（ユーザー確認必須）

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: NO（1-BE-2 に依存）
  - Blocks: 1-BE-3〜8

  **References**:
  - `backend/app/schemas/__init__.py` - スキーマ定義
  - `backend/app/models/__init__.py` - ORM モデル
  - `docs/plans/backend_test_cases.md` - 165件のテストケース定義
  - `docs/plans/momus.md` - テスト fixture 設計

  **Acceptance Criteria**:
  - [ ] 全テストファイルが作成される（backend_test_cases.md の165件）
  - [ ] テストは全て FAIL する（実装前）
  - [ ] テストカバレッジがスキーマの全フィールドを網羅
  - [ ] conftest.py に共通 fixture が定義される（momus.md 分野8 参照）

  **Commit**: YES
  - Message: `test: add all endpoint tests (TDD red phase)`
  - Files: `backend/tests/`

---

### Wave 2: バックエンド実装

- [ ] 4. 名刺 CRUD API

  **What to do**:
  - GET/POST/PATCH/DELETE `/api/v1/namecards` エンドポイント実装
  - Relationship, Tag, ContactMethod の紐付け処理

  **Must NOT do**:
  - ⛔ テストを変更しない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-5, 1-BE-6 と並行可）
  - Depends On: 1-BE-TEST

  **References**:
  - `backend/app/api/v1/endpoints/auth.py` - エンドポイント実装パターン
  - `backend/app/models/__init__.py` - ORM モデル
  - `backend/app/schemas/__init__.py` - スキーマ

  **Acceptance Criteria**:
  - [ ] pytest で名刺 CRUD テストが全て PASS する
  - [ ] 認証済みユーザーのみアクセス可能
  - [ ] 他ユーザーの名刺にアクセスできない

  **Commit**: YES
  - Message: `feat(api): implement namecard CRUD endpoints`
  - Files: `backend/app/api/v1/endpoints/namecards.py`
  - Pre-commit: `pytest tests/test_namecards.py`

---

- [ ] 5. Relationship CRUD API

  **What to do**:
  - 組織階層の CRUD エンドポイント
  - ツリー構造の取得
  - 循環参照防止バリデーション

  **Must NOT do**:
  - ⛔ テストを変更しない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-4, 1-BE-6 と並行可）

  **Acceptance Criteria**:
  - [ ] pytest で Relationship テストが全て PASS する
  - [ ] full_path が正しく返される
  - [ ] 循環参照が防止される

  **Commit**: YES
  - Message: `feat(api): implement relationship CRUD endpoints`

---

- [ ] 6. Tag CRUD API

  **What to do**:
  - タグの CRUD エンドポイント
  - 重複タグ名防止

  **Must NOT do**:
  - ⛔ テストを変更しない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-4, 1-BE-5 と並行可）

  **Acceptance Criteria**:
  - [ ] pytest で Tag テストが全て PASS する
  - [ ] 重複タグ名が防止される

  **Commit**: YES
  - Message: `feat(api): implement tag CRUD endpoints`

---

- [ ] 7. pg_bigm 検索 API

  **What to do**:
  - キーワード横断検索
  - Tag/Relationship フィルタ
  - ページネーション

  **Must NOT do**:
  - ⛔ テストを変更しない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`

  **Parallelization**:
  - Can Run In Parallel: NO（1-BE-4 に依存）

  **Acceptance Criteria**:
  - [ ] pytest で検索テストが全て PASS する
  - [ ] 日本語部分一致が動作する
  - [ ] pg_bigm GIN インデックスが使用される

  **Commit**: YES
  - Message: `feat(api): implement search with pg_bigm`

---

- [ ] 8. 画像処理 + OCR API

  **What to do**:
  - 2段階アップロードフロー:
    - `POST /images/upload` → upload_id 発行、OCR 非同期開始
    - `POST /images/process` → 四隅座標受信、OCR 完了待ち、遠近補正、WebP 変換
  - OpenCV 遠近補正（四隅座標使用）
  - Pillow WebP 変換（フル + サムネイル 300×188px）
  - Gemini 2.5 Flash OCR（`google-genai` SDK 使用）
  - OCR 結果は `NameCardCreate` スキーマと同一構造（[NC-1](../../docs/plans/momus.md)）

  > 📎 エンドポイント詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野6 を参照

  **Must NOT do**:
  - ⛔ テストを変更しない
  - ⛔ Tailwind を使用しない（フロント側）

  **Recommended Agent Profile**:
  - Category: `ultrabrain`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: NO（1-BE-4 に依存）

  **Acceptance Criteria**:
  - [ ] pytest で画像処理テストが全て PASS する
  - [ ] OCR が構造化データを返す
  - [ ] 並行処理が動作する

  **Commit**: YES
  - Message: `feat(api): implement image processing and OCR`

---

- [ ] 9. JSON エクスポート/インポート API

  **What to do**:
  - JSON エクスポート（全名刺+Relationship+Tag をネスト構造で出力）
  - JSON インポート（エクスポート形式と同一、競合時はスキップ）
  - Relationship はトポロジカル順序（parent_id 昇順、null先頭）でエクスポート

  > 📎 詳細仕様は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野7 を参照

  **Must NOT do**:
  - ⛔ テストを変更しない

  **Recommended Agent Profile**:
  - Category: `ultrabrain`

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-7, 1-BE-8 と並行可）

  **Acceptance Criteria**:
  - [ ] pytest で JSON テストが全て PASS する
  - [ ] エクスポート → インポート往復でデータ保持
  - [ ] ネストデータ（contact_methods, relationships, tags）が完全保存される

  **Commit**: YES
  - Message: `feat(api): implement JSON export/import`

---

### Wave 2: フロントエンド実装

- [ ] 10. Next.js プロジェクト基盤 + 認証 UI

  **What to do**:
  - Next.js **SSR + App Router** プロジェクト構成
  - **`src/` ディレクトリ構成**（app/, components/, lib/, hooks/, styles/）
  - shadcn/ui 導入（コピーして **SCSS 化**、Tailwind 完全削除）
  - API クライアント設定（**axios** + JWT インターセプター）
  - JWT 認証（ログイン/登録画面: `(auth)/login`, `(auth)/register`）
  - **ダークモード基盤**（**next-themes** + `html.dark` セレクター、SCSS 変数で対応）
  - Context API 設定（**AuthContext**, **ToastContext**）
  - ⚠️ **ThemeContext は不要**（next-themes の ThemeProvider で管理）

  > 📎 ページ構成・コンポーネント設計の詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) 分野10〜16 を参照

  **ディレクトリ構成**:
  ```
  frontend/src/
  ├── app/
  │   ├── (auth)/login/page.tsx, register/page.tsx
  │   ├── (main)/layout.tsx, page.tsx, namecards/, relationships/, tags/, import-export/, help/
  │   └── layout.tsx
  ├── components/ui/, layout/, namecard/, relationship/, tag/, camera/, search/
  ├── lib/
  │   ├── api/         # axios client, auth, namecards, relationships, tags, search, images, export-import
  │   ├── contexts/    # AuthContext, ToastContext
  │   └── schemas/     # Zod: auth, namecard, relationship, tag, contact-method, search, import
  ├── hooks/
  └── styles/          # _variables.scss（:root + html.dark）
  ```

  **Must NOT do**:
  - ⛔ **Tailwind CSS を絶対にインストール・使用しない**
  - ⛔ shadcn/ui コンポーネントは SCSS にリライトして使用
  - ⛔ ThemeContext を作成しない（next-themes を使用）

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-3〜9 と並行可、モック API 使用）
  - Depends On: 1-BE-2（スキーマ確定）

  **References**:
  - `docs/plans/momus.md` - フロントエンド計画（分野10〜16）
  - `docs/plans/design_decisions.md` - フロントエンド技術スタック
  - shadcn/ui 公式ドキュメント

  **Acceptance Criteria**:
  - [ ] App Router + src/ ディレクトリ構成で構築されている
  - [ ] ログイン/登録画面（`(auth)/` ルートグループ）が動作する
  - [ ] JWT トークンの保存・送信が動作する（axios インターセプター）
  - [ ] shadcn/ui コンポーネントが SCSS で実装されている
  - [ ] ⛔ Tailwind がインストールされていない
  - [ ] next-themes でダークモード切替が動作する（`html.dark` セレクター）
  - [ ] AuthContext, ToastContext が実装されている
  - [ ] Zod スキーマ（auth, namecard, relationship, tag, contact-method, search, import）が定義されている

  **Commit**: YES
  - Message: `feat(frontend): setup Next.js with shadcn/ui and auth`
  - Files: `frontend/`

---

- [ ] 11. 名刺一覧 + 詳細表示

  **What to do**:
  - 名刺一覧（カード/リスト表示切替）— **NameCardList**, **NameCardItem** コンポーネント
  - 詳細ページ（`/namecards/[id]`）— **NameCardDetail** コンポーネント
  - 詳細ページ上での**モーダル編集**（**NameCardEditDialog**）— 編集専用ルートは設けない
  - ページネーション
  - サムネイル表示

  **Must NOT do**:
  - ⛔ **Tailwind CSS を使用しない**
  - ⛔ 名刺編集用の専用ルート（`/namecards/[id]/edit`）を作成しない

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can Run In Parallel: YES（1-BE-3〜9, 1-FE-10 と並行可）

  **Acceptance Criteria**:
  - [ ] 名刺一覧がページネーション付きで表示される
  - [ ] Relationship full_path が表示される
  - [ ] SCSS でスタイリングされている
  - [ ] NameCardEditDialog がモーダルとして詳細ページ上で動作する

  **Commit**: YES
  - Message: `feat(frontend): implement namecard list and detail`

---

- [ ] 12. 名刺登録・編集フォーム

  **What to do**:
  - **NameCardForm** コンポーネント（**React Hook Form** + **Zod** バリデーション）
  - `@hookform/resolvers` で Zod スキーマをバリデータとして統合
  - ContactMethod の動的追加/削除（type は enum 17種）
  - Relationship ツリー選択 UI（**RelationshipSelect** コンポーネント）
  - Tag 選択 UI（**TagSelect** コンポーネント）
  - 新規登録: `/namecards/new` ページで NameCardForm を使用
  - 編集: **NameCardEditDialog**（モーダル）内で NameCardForm を使用

  > 📎 Zod スキーマ定義: `src/lib/schemas/namecard.ts`, `contact-method.ts`（momus.md 分野14 参照）

  **Must NOT do**:
  - ⛔ **Tailwind CSS を使用しない**
  - ⛔ 編集専用ルートを作成しない（モーダル方式）

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can Run In Parallel: YES

  **Acceptance Criteria**:
  - [ ] 名刺の手動作成・編集が動作する
  - [ ] React Hook Form + Zod でフォームバリデーションが動作する
  - [ ] Relationship ツリー選択が動作する
  - [ ] ContactMethod の動的追加/削除が動作する
  - [ ] 編集がモーダル（NameCardEditDialog）で動作する

  **Commit**: YES
  - Message: `feat(frontend): implement namecard form`

---

- [ ] 13. カメラ撮影 + 四隅選択 + OCR

  **What to do**:
  - **CameraCapture** コンポーネント: カメラガイド枠（名刺サイズ）、撮影機能
  - **CornerSelector** コンポーネント: SVG overlay で四隅選択（ドラッグ操作）
  - OCR 結果 → NameCardForm にプリフィル
  - モバイル対応

  **Must NOT do**:
  - ⛔ **Tailwind CSS を使用しない**

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`, `playwright`

  **Parallelization**:
  - Can Run In Parallel: NO（1-FE-12 に依存）

  **Acceptance Criteria**:
  - [ ] カメラ撮影画面にガイド枠が表示される
  - [ ] CornerSelector で四隅選択が SVG overlay で動作する
  - [ ] OCR 結果がフォームにプリフィルされる
  - [ ] モバイルブラウザで動作する

  **Commit**: YES
  - Message: `feat(frontend): implement camera capture and OCR`

---

- [ ] 14. 検索 UI + 管理 UI + JSON UI + ヘルプ

  **What to do**:
  - **SearchBar** コンポーネント（リアルタイム検索、debounce）
  - Tag/Relationship フィルタ
  - 組織階層管理画面（`/relationships`）— **RelationshipTree** コンポーネント
  - タグ管理画面（`/tags`）— **TagList** コンポーネント
  - JSON エクスポート/インポート UI（`/import-export` ページ）
  - **ヘルプページ**（`/help`）

  **Must NOT do**:
  - ⛔ **Tailwind CSS を使用しない**

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can Run In Parallel: YES

  **Acceptance Criteria**:
  - [ ] 検索がリアルタイムで動作する（SearchBar + debounce）
  - [ ] 組織階層管理 UI（RelationshipTree）が動作する
  - [ ] タグ管理 UI（TagList）が動作する
  - [ ] `/import-export` ページで JSON ダウンロード/アップロードが動作する
  - [ ] `/help` ページが表示される

  **Commit**: YES
  - Message: `feat(frontend): implement search, management, and JSON UI`

---

### Wave 3: CI/CD

- [ ] 15. GitHub Actions CI 設定

  **What to do**:
  - `.github/workflows/ci.yml` 作成
  - バックエンドテスト（pytest）
  - フロントエンドテスト（Vitest）
  - リント（Ruff, Biome）

  **Must NOT do**:
  - ⛔ Python 3.14 は Docker コンテナで実行

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: なし

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 2 完了後）

  **Acceptance Criteria**:
  - [ ] push/PR で CI が実行される
  - [ ] 全テストがグリーン
  - [ ] リントエラーがない

  **Commit**: YES
  - Message: `ci: add GitHub Actions workflow`

---

## Commit Strategy

### フロントエンド依存パッケージ

> 📎 詳細は [`docs/plans/momus.md`](../../docs/plans/momus.md) フロントエンド依存パッケージセクション を参照

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| next | ^14 | SSR + App Router |
| react / react-dom | ^18 | UI フレームワーク |
| axios | ^1.6 | HTTP クライアント（JWT インターセプター） |
| react-hook-form | ^7 | フォーム管理 |
| zod | ^3 | バリデーション |
| @hookform/resolvers | ^3 | Zod ↔ React Hook Form 統合 |
| next-themes | ^0.2 | ダークモード（html.dark） |
| lucide-react | ^0.300 | アイコン |

| Dev 依存 | バージョン | 用途 |
|----------|-----------|------|
| typescript | ^5 | 型安全 |
| sass | ^1.69 | SCSS（Tailwind 代替） |
| vitest | ^1 | ユニットテスト |
| @testing-library/react | ^14 | コンポーネントテスト |
| @playwright/test | ^1.40 | E2E テスト |

### フロントエンドテスト構成

**Vitest（ユニットテスト）**: `frontend/src/__tests__/`（components/, hooks/, lib/）

**Playwright（E2E テスト）**: `frontend/e2e/`
| ファイル | テスト対象 |
|---------|-----------|
| auth.spec.ts | ログイン → 名刺一覧表示 |
| namecards.spec.ts | 作成 → 詳細 → 編集（モーダル）→ 削除 |
| search.spec.ts | キーワード入力 → 結果表示 → フィルタ |
| ocr.spec.ts | カメラ撮影 → 四隅選択 → OCR 結果 → 保存 |
| relationships.spec.ts | ツリー表示 → ノード作成 → 名前変更 → 削除 |
| tags.spec.ts | 一覧表示 → 作成 → 名前変更 → 削除 |
| export-import.spec.ts | エクスポート → ファイル確認 |

---

### コミットメッセージ

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `chore(db): add alembic, pg_bigm extension, and drop contact_methods.label` | `alembic/`, `alembic.ini`, `docker-compose.yml`, `docker/postgres/Dockerfile` |
| 2 | `feat(schemas): add namecard, relationship, tag, contact schemas` | `backend/app/schemas/` |
| 3 | `test: add all endpoint tests (TDD red phase)` | `backend/tests/` |
| 4 | `feat(api): implement namecard CRUD endpoints` | `backend/app/api/v1/endpoints/namecards.py` |
| 5 | `feat(api): implement relationship CRUD endpoints` | `backend/app/api/v1/endpoints/relationships.py` |
| 6 | `feat(api): implement tag CRUD endpoints` | `backend/app/api/v1/endpoints/tags.py` |
| 7 | `feat(api): implement search with pg_bigm` | `backend/app/api/v1/endpoints/search.py` |
| 8 | `feat(api): implement image processing and OCR` | `backend/app/api/v1/endpoints/images.py`, `backend/app/services/` |
| 9 | `feat(api): implement JSON export/import` | `backend/app/api/v1/endpoints/export.py`, `import_.py` |
| 10 | `feat(frontend): setup Next.js with shadcn/ui and auth` | `frontend/` |
| 11 | `feat(frontend): implement namecard list and detail` | `frontend/src/` |
| 12 | `feat(frontend): implement namecard form` | `frontend/src/` |
| 13 | `feat(frontend): implement camera capture and OCR` | `frontend/src/` |
| 14 | `feat(frontend): implement search, management, and JSON UI` | `frontend/src/` |
| 15 | `ci: add GitHub Actions workflow` | `.github/workflows/` |

---

## Success Criteria

### Verification Commands
```bash
# バックエンドテスト
cd backend && uv run pytest

# フロントエンドテスト
cd frontend && pnpm test

# E2E テスト
cd frontend && pnpm playwright test

# CI ローカル実行
act push

# 起動確認
docker compose up -d
curl http://localhost:8000/health
curl http://localhost:3000
```

### Final Checklist
- [ ] 全テスト（ユニット + 統合 + E2E）がグリーン
- [ ] GitHub Actions CI で全テストが自動実行される
- [ ] `docker compose up` で正常起動
- [ ] OpenAPI ドキュメントで全エンドポイント確認可能
- [ ] next-themes でダークモード動作（`html.dark` セレクター）
- [ ] モバイル/デスクトップでレスポンシブ対応
- [ ] ⛔ Tailwind CSS がインストールされていない
- [ ] shadcn/ui が SCSS で実装されている
- [ ] 全 UI テキストが日本語
- [ ] OCR が正常に動作する
- [ ] 検索（pg_bigm）が正常に動作する
- [ ] JSON エクスポート/インポートが正常に動作する
- [ ] App Router + src/ ディレクトリ構成が正しい
- [ ] React Hook Form + Zod でフォームバリデーションが動作する
- [ ] 名刺編集がモーダル（NameCardEditDialog）で動作する
- [ ] Playwright E2E テスト（7シナリオ）がグリーン

---

## 改訂履歴

| 日時 | 内容 |
|------|------|
| 2026-02-28 | 初版作成 |
| 2026-02-28 | momus.md 決定事項を反映: CSV→JSON変更、ContactMethod.label廃止、pg_bigmカスタムDockerfile、2段階画像アップロードフロー、依存パッケージ更新（google-genai, psycopg[binary]等）、テスト計画拡充（165件）、ルーター登録追加、API仕様詳細参照追加 |
| 2026-02-28 | momus.md フロントエンド計画を反映: App Router+src/構成、next-themes（html.dark）、React Hook Form+Zod、axios+JWTインターセプター、NameCardEditDialog（モーダル編集）、CornerSelector、Context API（AuthContext/ToastContext）、フロントエンド依存パッケージ・E2Eテスト構成追加、/import-export・/helpページ追加 |
