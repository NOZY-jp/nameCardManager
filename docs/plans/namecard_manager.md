# 名刺管理アプリ Phase 構成計画

> 作成日: 2026-02-28
> 対象: nameCardManager — 段階的実装計画
> 技術スタック: FastAPI (Python 3.14) + PostgreSQL 16 + Next.js + **shadcn/ui** + **SCSS**（⚠️ Tailwind 不使用）
> 関連: [設計意思決定](./design_decisions.md) / [初期実装状況](./initial_impl.md) / [DBスキーマ](../dev/db/schema.md)

---

## 重要な決定事項・制約

> **以下は全 Phase に適用される横断的な決定事項。詳細は [設計意思決定](./design_decisions.md) を参照。**

| 項目 | 決定 |
|---|---|
| **デプロイ** | VPS（自前管理） |
| **CI/CD** | GitHub Actions（Phase 1 から導入）、パブリックリポジトリ |
| **Python** | 3.14（CI では Docker コンテナを使用） |
| **⚠️ テスト戦略** | **テストファースト** — テストを先に完成させ、テストが通るように実装する。テスト改変はユーザー確認必須 |
| **UI コンポーネント** | **shadcn/ui** を使用 |
| **スタイリング** | **SCSS** を使用 |
| **🚫 Tailwind CSS** | **絶対に使用しない** |
| **ダークモード** | 対応する |
| **API 設計** | 序盤にがちがちに設計（フロント・バック並列実装のため） |
| **エラーメッセージ** | ユーザー向けは日本語 |
| **国際化** | 日本語のみ |
| **画像制限** | アップロード最大 20MB |
| **名刺上限** | 制限なし |

---

## 目次

1. [Phase 構成表（全体俯瞰）](#phase-構成表全体俯瞰)
2. [Phase 間の依存関係](#phase-間の依存関係)
3. [Phase 1: MVP — バックエンド](#phase-1-mvp--バックエンド)
4. [Phase 1: MVP — フロントエンド](#phase-1-mvp--フロントエンド)
5. [Phase 2: 拡張機能](#phase-2-拡張機能)
6. [Phase 3: 将来機能](#phase-3-将来機能)
7. [実装済みコンポーネント（Phase 0）](#実装済みコンポーネントphase-0)
8. [工数サマリ](#工数サマリ)
9. [リスクと緩和策](#リスクと緩和策)

---

## Phase 構成表（全体俯瞰）

| Phase | 名称 | スコープ | 概算工数 | 前提 |
|---|---|---|---|---|
| **0** | 基盤（実装済み） | 認証、ORM モデル、DB スキーマ、Docker 環境 | — | — |
| **1-BE** | MVP バックエンド | CRUD API、検索、画像処理、OCR、CSV エクスポート/インポート | **3〜4 週間** | Phase 0 |
| **1-FE** | MVP フロントエンド | Next.js UI（一覧、登録、編集、検索、カメラ/OCR） | **3〜4 週間** | Phase 1-BE（API 完成後。並行開発可） |
| **2** | 拡張機能 | 住所、バックアップ自動化、重複検出 | **1〜2 週間** | Phase 1 完了 |
| **3** | 将来機能 | vCard エクスポート、ローマ字検索、変更履歴、SNS リンク | **未定** | Phase 2 完了 |

> **Phase 1-BE と 1-FE は並行開発可能。** API スキーマ（OpenAPI）を**序盤にがちがちに設計**すれば、バックエンド実装中にフロントエンドの UI 開発を開始できる。

---

## Phase 間の依存関係

```
Phase 0 (実装済み)
  │
  ├─── Phase 1-BE (MVP バックエンド)
  │        │
  │        ├── 1-BE-1: Alembic + スキーマ確定
  │        ├── 1-BE-2: Pydantic スキーマ定義 ─────────┐
  │        ├── 1-BE-3: 名刺 CRUD API ← 1-BE-1, 1-BE-2 │
  │        ├── 1-BE-4: Relationship CRUD API ← 1-BE-2  │ OpenAPI 確定
  │        ├── 1-BE-5: Tag CRUD API ← 1-BE-2           │ ↓
  │        ├── 1-BE-6: pg_bigm + 検索 API ← 1-BE-3    ├── Phase 1-FE (並行開発可)
  │        ├── 1-BE-7: 画像処理 + OCR ← 1-BE-3        │
  │        └── 1-BE-8: CSV エクスポート/インポート      │
  │                                                     │
  ├─── Phase 1-FE (MVP フロントエンド) ←────────────────┘
  │        │
  │        ├── 1-FE-1: プロジェクト基盤 + 認証 UI
  │        ├── 1-FE-2: 名刺一覧 + 詳細表示
  │        ├── 1-FE-3: 名刺登録・編集フォーム
  │        ├── 1-FE-4: Relationship / Tag 管理 UI
  │        ├── 1-FE-5: 検索 UI
  │        ├── 1-FE-6: カメラ撮影 + 四隅選択 + OCR
  │        └── 1-FE-7: CSV エクスポート/インポート UI
  │
  ├─── Phase 2 (拡張機能) ← Phase 1 完了
  │        ├── 2-1: addresses テーブル + API + UI
  │        ├── 2-2: バックアップ自動化
  │        └── 2-3: 重複検出
  │
  └─── Phase 3 (将来) ← Phase 2 完了
           ├── 3-1: vCard 3.0 エクスポート
           ├── 3-2: ローマ字検索
           ├── 3-3: 変更履歴
           └── 3-4: SNS リンク
```

---

## Phase 1: MVP — バックエンド

> **目標**: 名刺データの登録・検索・画像管理・OCR・CSV 入出力が API として動作する
> **概算工数**: 3〜4 週間（テスト込み）
> **⚠️ テスト戦略**: テストファースト — 各タスクでテストを先に完成させ、テストが通るように実装する。テストの改変はユーザー確認必須。

### 1-BE-1: Alembic 導入 + DB マイグレーション基盤

| 項目 | 内容 |
|---|---|
| **やること** | Alembic 初期化、既存スキーマの initial マイグレーション生成、pg_bigm 拡張の有効化、GIN インデックス作成 |
| **成果物** | `alembic/`, `alembic.ini`, initial migration ファイル |
| **工数** | 2〜3 日 |
| **テスト** | マイグレーション `upgrade`/`downgrade` の往復確認 |

**Done 条件:**
- [ ] `alembic upgrade head` で空 DB にスキーマが作成される
- [ ] `alembic downgrade base` → `alembic upgrade head` が冪等に動作する
- [ ] pg_bigm 拡張が有効化され、GIN インデックスが作成される
- [ ] `docker-compose.yml` の db サービスに `shared_preload_libraries=pg_bigm` が設定済み

---

### 1-BE-2: Pydantic スキーマ定義

| 項目 | 内容 |
|---|---|
| **やること** | NameCard, Relationship, Tag, ContactMethod, 検索の Request/Response スキーマを定義 |
| **成果物** | `backend/app/schemas/` 配下のスキーマ定義 |
| **工数** | 1〜2 日 |
| **テスト** | スキーマのバリデーションユニットテスト |

**必要なスキーマ一覧:**

| スキーマ | 用途 |
|---|---|
| `NameCardCreate` | 名刺作成リクエスト |
| `NameCardUpdate` | 名刺更新リクエスト |
| `NameCardResponse` | 名刺レスポンス（Relationship, Tag, ContactMethod 含む） |
| `NameCardListResponse` | 名刺一覧レスポンス（ページネーション含む） |
| `RelationshipCreate` | Relationship 作成リクエスト |
| `RelationshipResponse` | Relationship レスポンス（full_path 含む） |
| `RelationshipTreeResponse` | Relationship ツリー構造レスポンス |
| `TagCreate` / `TagUpdate` | Tag 作成/更新リクエスト |
| `TagResponse` | Tag レスポンス |
| `ContactMethodCreate` | ContactMethod 作成リクエスト |
| `ContactMethodResponse` | ContactMethod レスポンス |
| `SearchRequest` | 検索リクエスト（キーワード + フィルタ） |
| `SearchResponse` | 検索レスポンス |

**Done 条件:**
- [ ] 上記スキーマが全て定義済み
- [ ] バリデーションルール（必須/任意、文字数制限等）のユニットテスト

---

### 1-BE-3: 名刺 CRUD API

| 項目 | 内容 |
|---|---|
| **やること** | `namecards.py` に CRUD エンドポイントを実装。Relationship/Tag/ContactMethod の紐付けを含む |
| **成果物** | `backend/app/api/v1/endpoints/namecards.py` |
| **工数** | 3〜4 日 |
| **テスト** | 各エンドポイントの統合テスト（pytest + TestClient） |
| **依存** | 1-BE-1, 1-BE-2 |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/v1/namecards` | 名刺一覧（ページネーション） |
| `POST` | `/api/v1/namecards` | 名刺作成（ContactMethod, Relationship, Tag 紐付け含む） |
| `GET` | `/api/v1/namecards/{id}` | 名刺詳細（全リレーション eager load） |
| `PATCH` | `/api/v1/namecards/{id}` | 名刺更新（部分更新） |
| `DELETE` | `/api/v1/namecards/{id}` | 名刺削除（cascade） |

**Done 条件:**
- [ ] 5 エンドポイントが全て動作する
- [ ] 認証済みユーザーのみアクセス可能（`AuthUser` 依存性）
- [ ] 他ユーザーの名刺にアクセスできない（user_id スコープ）
- [ ] Relationship, Tag, ContactMethod の紐付け・更新が正しく動作する
- [ ] ページネーション（offset/limit）が動作する
- [ ] 統合テスト（正常系 + 異常系）

---

### 1-BE-4: Relationship CRUD API

| 項目 | 内容 |
|---|---|
| **やること** | Relationship の CRUD エンドポイント。ツリー構造の取得・操作を含む |
| **成果物** | `backend/app/api/v1/endpoints/relationships.py` |
| **工数** | 2〜3 日 |
| **テスト** | 階層構造の CRUD 統合テスト |
| **依存** | 1-BE-2 |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/v1/relationships` | ルートノード一覧 |
| `GET` | `/api/v1/relationships/tree` | 全ツリー構造 |
| `POST` | `/api/v1/relationships` | ノード作成（parent_id 指定） |
| `PATCH` | `/api/v1/relationships/{id}` | ノード更新（名前変更、親変更） |
| `DELETE` | `/api/v1/relationships/{id}` | ノード削除（子孫の扱いを決定） |

**Done 条件:**
- [ ] ツリー構造の作成・取得・更新・削除が正しく動作する
- [ ] `full_path` がレスポンスに含まれる
- [ ] 循環参照の防止バリデーション
- [ ] 統合テスト

---

### 1-BE-5: Tag CRUD API

| 項目 | 内容 |
|---|---|
| **やること** | Tag の CRUD エンドポイント |
| **成果物** | `backend/app/api/v1/endpoints/tags.py` |
| **工数** | 1 日 |
| **テスト** | Tag CRUD の統合テスト |
| **依存** | 1-BE-2 |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/v1/tags` | タグ一覧 |
| `POST` | `/api/v1/tags` | タグ作成 |
| `PATCH` | `/api/v1/tags/{id}` | タグ更新 |
| `DELETE` | `/api/v1/tags/{id}` | タグ削除 |

**Done 条件:**
- [ ] CRUD が全て動作する
- [ ] 重複タグ名の防止
- [ ] 統合テスト

---

### 1-BE-6: pg_bigm 検索 API

| 項目 | 内容 |
|---|---|
| **やること** | `search.py` に検索エンドポイントを実装。pg_bigm GIN インデックスを活用した横断検索 |
| **成果物** | `backend/app/api/v1/endpoints/search.py` |
| **工数** | 2〜3 日 |
| **テスト** | 日本語検索・カナ検索・部分一致の統合テスト |
| **依存** | 1-BE-3（名刺データがないと検索テスト不可） |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/v1/search` | キーワード横断検索（名前、カナ、Relationship、ContactMethod、notes、met_notes） |

**検索仕様:**
- クエリパラメータ `q` でキーワード検索
- フィルタ: `tag_ids`, `relationship_ids` でフィルタリング
- ソート: `bigm_similarity()` スコア降順
- ページネーション: `offset`, `limit`

**Done 条件:**
- [ ] 日本語部分一致検索が動作する（漢字、カナ）
- [ ] 複数フィールド横断検索が動作する
- [ ] Tag/Relationship フィルタが動作する
- [ ] pg_bigm GIN インデックスが `EXPLAIN` で使用されることを確認
- [ ] 統合テスト

---

### 1-BE-7: 画像処理 + OCR

| 項目 | 内容 |
|---|---|
| **やること** | 画像アップロード、WebP 変換、サムネイル生成、OpenCV 遠近補正、Gemini 2.5 Flash OCR |
| **成果物** | `backend/app/api/v1/endpoints/images.py`, `backend/app/services/ocr.py`, `backend/app/services/image_processor.py` |
| **工数** | 4〜5 日 |
| **テスト** | 画像処理ユニットテスト + OCR モックテスト |
| **依存** | 1-BE-3（名刺と画像の紐付け） |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/v1/images/upload` | 画像アップロード + 四隅座標受け取り（**最大 20MB**） |
| `POST` | `/api/v1/images/ocr` | OCR 実行（Gemini 2.5 Flash）→ 構造化データ返却 |
| `GET` | `/api/v1/images/{namecard_id}` | 名刺画像取得（FileResponse） |
| `GET` | `/api/v1/images/{namecard_id}/thumbnail` | サムネイル取得 |

**処理フロー:**
1. フロントから画像 + 四隅座標を受信
2. 並行処理:
   - OCR: Gemini 2.5 Flash に元画像を送信 → 構造化 JSON を取得
   - 画像処理: OpenCV 遠近補正 → Pillow WebP 変換（フル + サムネイル）→ ローカル保存
3. 両結果をフロントに返却

**Done 条件:**
- [ ] 画像アップロード → WebP 変換 → ローカル保存が動作する
- [ ] サムネイル（300×188px）が自動生成される
- [ ] EXIF 回転が正しく処理される
- [ ] OpenCV 遠近補正が四隅座標で動作する
- [ ] Gemini 2.5 Flash OCR が構造化データを返す
- [ ] OCR と画像処理の並行実行が動作する
- [ ] 画像処理のユニットテスト（Pillow, OpenCV）
- [ ] OCR のモックテスト（Gemini API をモック）

---

### 1-BE-8: CSV エクスポート/インポート

| 項目 | 内容 |
|---|---|
| **やること** | CSV エクスポート（全名刺 or フィルタ済み）、CSV インポート（Google Contacts フォーマット対応） |
| **成果物** | `backend/app/api/v1/endpoints/export.py`, `backend/app/api/v1/endpoints/import_.py` |
| **工数** | 2〜3 日 |
| **テスト** | エクスポート/インポートの往復テスト |
| **依存** | 1-BE-3 |

**エンドポイント:**

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/v1/export/csv` | CSV エクスポート（StreamingResponse） |
| `POST` | `/api/v1/import/csv` | CSV インポート（ファイルアップロード） |

**Done 条件:**
- [ ] 全名刺の CSV エクスポートが動作する（Relationship full_path, Tag, ContactMethod を含む）
- [ ] Google Contacts CSV フォーマットのインポートが動作する
- [ ] エクスポート → インポートの往復で名刺データが保持される
- [ ] 文字コード UTF-8 BOM 対応（Excel 互換）
- [ ] 統合テスト

---

### Phase 1-BE Done 条件（全体）

- [ ] 上記 1-BE-1 〜 1-BE-8 の Done 条件が全て達成
- [ ] **全テストがテストファーストで記述され**、ユニット + 統合テストがグリーン
- [ ] **エラーメッセージ（ユーザー向け）が日本語で記述されている**
- [ ] OpenAPI ドキュメント（`/docs`）で全エンドポイントが確認可能
- [ ] **GitHub Actions CI がグリーン**
- [ ] `docker compose up` でバックエンド + DB が正常起動する

---

## Phase 1: MVP — フロントエンド

> **目標**: Next.js で名刺管理の全 UI が動作し、バックエンド API と連携する
> **概算工数**: 3〜4 週間（テスト込み）
> **開始条件**: Phase 1-BE の Pydantic スキーマ（1-BE-2）が確定次第、並行開発開始可能
> **UI コンポーネント**: **shadcn/ui** を使用
> **スタイリング**: **SCSS** を使用（🚫 **Tailwind CSS は絶対に使用しない**）
> **ダークモード**: 対応する
> **⚠️ テスト戦略**: テストファースト — テストを先に完成させ、テストが通るように実装する。テストの改変はユーザー確認必須。

### 1-FE-1: プロジェクト基盤 + 認証 UI

| 項目 | 内容 |
|---|---|
| **やること** | Next.js プロジェクト構成（**shadcn/ui + SCSS、🚫 Tailwind 不使用**）、API クライアント設定、JWT 認証（ログイン/登録画面）、レイアウト、**ダークモード対応** |
| **工数** | 3〜4 日 |
| **テスト** | 認証フローの E2E テスト |
| **依存** | Phase 0（認証 API 実装済み） |

**Done 条件:**
- [ ] ログイン/登録画面が動作する
- [ ] JWT トークンの保存・送信・リフレッシュが動作する
- [ ] 未認証時のリダイレクトが動作する
- [ ] 共通レイアウト（ヘッダー、ナビゲーション）
- [ ] **shadcn/ui コンポーネントが SCSS でスタイリングされている（Tailwind 不使用）**
- [ ] **ダークモード切り替えが動作する**

---

### 1-FE-2: 名刺一覧 + 詳細表示

| 項目 | 内容 |
|---|---|
| **やること** | 名刺一覧（カード/リスト表示切替）、詳細ページ、ページネーション |
| **工数** | 3〜4 日 |
| **テスト** | コンポーネントテスト |
| **依存** | 1-FE-1, 1-BE-3 |

**Done 条件:**
- [ ] 名刺一覧がページネーション付きで表示される
- [ ] 名刺カードにサムネイル、名前、所属（Relationship full_path）が表示される
- [ ] 詳細ページで全情報（ContactMethod, Tag, Relationship, met_notes, notes）が表示される

---

### 1-FE-3: 名刺登録・編集フォーム

| 項目 | 内容 |
|---|---|
| **やること** | 名刺の手動入力フォーム、ContactMethod の動的追加/削除、Relationship/Tag の選択 UI |
| **工数** | 3〜4 日 |
| **テスト** | フォームバリデーション + 送信テスト |
| **依存** | 1-FE-1, 1-BE-3 |

**Done 条件:**
- [ ] 名刺の手動作成が動作する
- [ ] 名刺の編集（部分更新）が動作する
- [ ] ContactMethod の動的追加/削除が UI で動作する
- [ ] Relationship のツリー選択 UI が動作する
- [ ] Tag の選択/作成 UI が動作する
- [ ] フォームバリデーション（必須フィールド等）

---

### 1-FE-4: Relationship / Tag 管理 UI

| 項目 | 内容 |
|---|---|
| **やること** | Relationship ツリーの管理画面（作成、編集、削除、ドラッグ移動）、Tag 一覧管理 |
| **工数** | 2〜3 日 |
| **テスト** | ツリー操作テスト |
| **依存** | 1-FE-1, 1-BE-4, 1-BE-5 |

**Done 条件:**
- [ ] Relationship ツリーが視覚的に表示される
- [ ] ノードの作成・編集・削除が動作する
- [ ] Tag の一覧表示・作成・編集・削除が動作する

---

### 1-FE-5: 検索 UI

| 項目 | 内容 |
|---|---|
| **やること** | 検索バー、リアルタイム検索（debounce）、Tag/Relationship フィルタ |
| **工数** | 2 日 |
| **テスト** | 検索結果表示テスト |
| **依存** | 1-FE-2, 1-BE-6 |

**Done 条件:**
- [ ] キーワード入力で名刺がリアルタイム検索される（debounce 300ms）
- [ ] Tag フィルタで絞り込みが動作する
- [ ] Relationship フィルタで絞り込みが動作する
- [ ] 検索結果のハイライト表示

---

### 1-FE-6: カメラ撮影 + 四隅選択 + OCR

| 項目 | 内容 |
|---|---|
| **やること** | カメラガイド枠、撮影、SVG overlay で四隅選択、OCR 結果→登録フォームへのプリフィル |
| **工数** | 4〜5 日 |
| **テスト** | カメラ・OCR フローの E2E テスト |
| **依存** | 1-FE-3, 1-BE-7 |

**Done 条件:**
- [ ] カメラ撮影画面にガイド枠が表示される
- [ ] 撮影後に SVG overlay で四隅が選択できる
- [ ] 四隅座標 + 画像がバックエンドに送信される
- [ ] OCR 結果が登録フォームにプリフィルされる
- [ ] OCR 結果をユーザーが確認・編集して保存できる
- [ ] モバイルブラウザで動作する

---

### 1-FE-7: CSV エクスポート/インポート UI

| 項目 | 内容 |
|---|---|
| **やること** | CSV ダウンロードボタン、CSV ファイルアップロード + プレビュー + 確認画面 |
| **工数** | 1〜2 日 |
| **テスト** | エクスポート/インポートフローテスト |
| **依存** | 1-FE-2, 1-BE-8 |

**Done 条件:**
- [ ] CSV エクスポートボタンでファイルダウンロードが動作する
- [ ] CSV インポート: ファイル選択 → プレビュー → 確認 → 実行が動作する
- [ ] インポートエラー時のフィードバック表示

---

### Phase 1-FE Done 条件（全体）

- [ ] 上記 1-FE-1 〜 1-FE-7 の Done 条件が全て達成
- [ ] モバイル/デスクトップのレスポンシブ対応
- [ ] **ダークモード対応が全画面で動作する**
- [ ] **全コンポーネントが shadcn/ui + SCSS でスタイリングされている（Tailwind 不使用）**
- [ ] **エラーメッセージが日本語で表示される**
- [ ] `docker compose up` でフロントエンド + バックエンド + DB が正常起動し連携動作する

---

## Phase 2: 拡張機能

> **目標**: 住所管理、バックアップ自動化、重複検出
> **概算工数**: 1〜2 週間
> **開始条件**: Phase 1（BE + FE）完了

### 2-1: addresses テーブル + API + UI

| 項目 | 内容 |
|---|---|
| **やること** | 構造化日本語住所テーブル、CRUD API、フォーム + 表示 UI |
| **工数** | 3〜4 日 |
| **テスト** | 住所 CRUD 統合テスト |
| **依存** | Phase 1 |

**Done 条件:**
- [ ] Alembic マイグレーションで `addresses` テーブルが作成される
- [ ] 住所の CRUD API が動作する
- [ ] 住所入力フォーム（郵便番号→住所自動補完を検討）
- [ ] 名刺詳細に住所が表示される

---

### 2-2: バックアップ自動化

| 項目 | 内容 |
|---|---|
| **やること** | `pg_dump` + 画像ディレクトリ `tar` の定期実行スクリプト |
| **工数** | 2〜3 日 |
| **テスト** | バックアップ → リストアの往復テスト |
| **依存** | Phase 1 |

**Done 条件:**
- [ ] cron or Docker ベースの定期バックアップが動作する
- [ ] DB + 画像の両方がバックアップされる
- [ ] バックアップからのリストア手順が文書化されている
- [ ] 古いバックアップの自動削除（ローテーション）

---

### 2-3: 重複検出

| 項目 | 内容 |
|---|---|
| **やること** | 同一人物の名刺を検出し、マージ提案する機能 |
| **工数** | 3〜4 日 |
| **テスト** | 重複検出ロジックのユニットテスト |
| **依存** | Phase 1 |

**重複判定基準:**
- 名前の完全一致 or `bigm_similarity()` > 0.7
- 同一メールアドレス
- 同一電話番号

**Done 条件:**
- [ ] 重複候補の一覧が表示される
- [ ] マージ操作（どちらのデータを残すか選択）が動作する
- [ ] マージ後に ContactMethod, Relationship, Tag が統合される

---

### Phase 2 Done 条件（全体）

- [ ] 上記 2-1 〜 2-3 の Done 条件が全て達成
- [ ] 全テストがグリーン

---

## Phase 3: 将来機能

> **概算工数**: 未定（各機能 2〜5 日）
> **開始条件**: Phase 2 完了

| # | 機能 | 概要 | 工数見積 |
|---|---|---|---|
| 3-1 | **vCard 3.0 エクスポート** | 単体・一括エクスポート。Relationship → ORG/TITLE 変換 | 3〜4 日 |
| 3-2 | **ローマ字検索** | `pykakasi` でカナ → ローマ字変換、`*_romaji` カラム追加 | 2〜3 日 |
| 3-3 | **変更履歴** | `name_card_history` append-only テーブル | 2〜3 日 |
| 3-4 | **SNS リンク** | ContactMethod の `type` に LinkedIn, X 等を追加（既存モデルで対応可能） | 1 日 |

Phase 3 の各機能は独立しており、優先度に応じて個別に実装可能。

---

## 実装済みコンポーネント（Phase 0）

Phase 1 開始時点で既に完成しているコンポーネント:

| コンポーネント | ファイル | 状態 |
|---|---|---|
| 設定管理 | `backend/app/core/config.py` | ✅ 完成 |
| DB 接続 | `backend/app/core/database.py` | ✅ 完成 |
| 認証（JWT + bcrypt） | `backend/app/core/auth.py` | ✅ 完成 |
| ORM モデル（7 テーブル） | `backend/app/models/__init__.py` | ✅ 完成 |
| 認証スキーマ | `backend/app/schemas/__init__.py` | ✅ 完成（認証系のみ） |
| 依存性エイリアス | `backend/app/api/v1/deps.py` | ✅ 完成 |
| 認証 API（登録/ログイン/me） | `backend/app/api/v1/endpoints/auth.py` | ✅ 完成 |
| ルーター集約 | `backend/app/api/v1/api.py` | ✅ 完成 |
| アプリ基盤（main.py） | `backend/app/main.py` | ✅ 完成 |
| Docker 環境 | `docker-compose.yml` | ✅ 完成 |
| DB ドキュメント | `docs/dev/db/` | ✅ 完成 |

> **⚠️ 既知の問題**: `images.py`, `namecards.py`, `search.py` が空ファイルのため、`api.py` の import でアプリが起動しない。Phase 1-BE 開始時に `router = APIRouter()` を追加する必要がある。

---

## 工数サマリ

| Phase | スコープ | 工数 | 累計 |
|---|---|---|---|
| Phase 0 | 基盤（実装済み） | — | — |
| Phase 1-BE | MVP バックエンド | 3〜4 週間 | 3〜4 週間 |
| Phase 1-FE | MVP フロントエンド（並行可） | 3〜4 週間 | 3〜4 週間（並行時）/ 6〜8 週間（直列時） |
| Phase 2 | 拡張機能 | 1〜2 週間 | 4〜6 週間（並行時） |
| Phase 3 | 将来機能 | 機能毎 1〜5 日 | — |

**最短スケジュール（BE/FE 並行開発）**: Phase 1 完了まで約 4 週間、Phase 2 完了まで約 6 週間
**単独開発スケジュール**: Phase 1 完了まで約 7 週間、Phase 2 完了まで約 9 週間

---

## リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| Gemini API の仕様変更・レート制限 | OCR 機能停止 | OCR サービスを抽象化し、差し替え可能に設計 |
| pg_bigm の Docker イメージ互換性 | DB 起動不可 | カスタム PostgreSQL Dockerfile で pg_bigm をビルド。フォールバックとして LIKE 検索を残す |
| OpenCV の依存サイズ | Docker イメージ肥大化 | `opencv-python-headless` を使用（GUI 不要） |
| フロント・バック並行開発の API 齟齬 | 手戻り | **API スキーマ（OpenAPI）を序盤にがちがちに設計**。Pydantic スキーマ先行定義 |
| カメラ API のブラウザ互換性 | モバイルで動作しない | `getUserMedia` API + polyfill。Safari/Chrome で動作確認 |
| shadcn/ui の Tailwind 依存 | スタイリング困難 | **SCSS でスタイルをオーバーライド。Tailwind は絶対にインストールしない** |
| Python 3.14 のライブラリ互換性 | 依存パッケージが未対応 | CI（GitHub Actions）で Docker コンテナを使用して互換性を継続的に検証 |
