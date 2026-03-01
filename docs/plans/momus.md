# Phase 1 計画レビューインタビュー記録

> 作成日: 2026-02-28
> 目的: レビュー指摘に基づき API仕様・テスト計画の詳細を確定する

> **⚠️ [NC-12] 優先度に関する注記**: このドキュメントの決定事項は `.sisyphus/plans/namecard_manager_phase1.md` より優先される。CSVエクスポート/インポートは JSON エクスポート/インポートに変更された。

---

## レビューサマリー

**総合評価**: 🔴 不合格

**主要指摘**:
1. API仕様が「がちがち」に程遠い（URL列挙レベルで止まっている）
2. テストケースが1つも定義されていない
3. Pydantic スキーマのフィールド定義が未確定

---

## インタビュー分野

### バックエンド（完了）

| # | 分野 | ステータス | 決定事項数 |
|---|------|-----------|-----------|
| 1 | API仕様（共通仕様） | ✅ 完了 | 7項目 |
| 2 | NameCard API 詳細 | ✅ 完了 | 5項目 |
| 3 | Relationship API 詳細 | ✅ 完了 | 2項目 |
| 4 | Tag API 詳細 | ✅ 完了 | 3項目 |
| 5 | Search API 詳細 | ✅ 完了 | 1項目 |
| 6 | Image/OCR API 詳細 | ✅ 完了 | 3項目 |
| 7 | JSON Export/Import | ✅ 完了 | 2項目 |
| 8 | テスト計画 | ✅ 完了 | 165ケース（test_cases.md） |
| 9 | インフラ | ✅ 完了 | 2項目 |

### フロントエンド（完了）

| # | 分野 | ステータス | 決定事項数 |
|---|------|-----------|-----------|
| 10 | プロジェクト構成 | ✅ 完了 | 3項目 |
| 11 | ページ・ルーティング | ✅ 完了 | 2項目 |
| 12 | コンポーネント設計 | ✅ 完了 | 1項目 |
| 13 | 状態管理 | ✅ 完了 | 1項目 |
| 14 | API クライアント | ✅ 完了 | 2項目 |
| 15 | ダークモード | ✅ 完了 | 1項目 |
| 16 | フロントエンドテスト | ✅ 完了 | 1項目 |

---

## 分野 1: API仕様（共通仕様）

### 質問項目

#### Q1-1: ページネーション方式
- **未定**: offset/limit 方式か cursor 方式か
- **検討事項**:
  - offset/limit: 実装が簡単、総件数取得が容易
  - cursor: 大規模データで有利、リアルタイム更新に強い

#### Q1-2: エラーレスポンス形式
- **未定**: FastAPI デフォルトの `{"detail": "..."}` か、独自形式か
- **選択肢**:
  ```json
  // A案: FastAPI デフォルト
  {"detail": "エラーメッセージ"}
  
  // B案: 構造化エラー
  {"code": "VALIDATION_ERROR", "message": "バリデーションエラー", "errors": [...]}
  ```

#### Q1-3: HTTPステータスコードの使い分け
- **未定**: 403 vs 404（他ユーザーのリソースアクセス）
- **未定**: 400 vs 422（バリデーションエラー）

#### Q1-4: 日時フォーマット
- **未定**: ISO 8601 (UTC) で統一するか

#### Q1-5: ソート・フィルタの共通パラメータ
- **決定**: updated_at DESC

---

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| ページネーション | **offset/limit** 方式（`page`, `per_page` パラメータ） |
| エラーレスポンス | **`{"detail": "..."}`** 形式（FastAPI デフォルト） |
| 権限エラー | **404 Not Found**（リソース存在を隠蔽） |
| 日時フォーマット | **ISO 8601 (UTC)** 例: `2026-02-28T06:21:55Z` |
| per_page デフォルト | **20件** |
| per_page 上限 | **100件**（超過時は100に丸める） |
| デフォルトソート | **updated_at DESC** |

> **⚠️ [NC-15] 422 バリデーションエラーの形式**: 422 Validation Error は FastAPI デフォルト形式に従う。`detail` フィールドはエラーオブジェクトの配列となる:
> ```json
> {"detail": [{"loc": ["body", "field_name"], "msg": "エラーメッセージ", "type": "エラー種別"}]}
> ```
> test_cases.md に記載の `{"detail": "Validation error", "errors": [...]}` 形式は使用しない。

#### ページネーション共通レスポンス形式
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

#### 共通クエリパラメータ
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `page` | int | 1 | ページ番号（1始まり） |
| `per_page` | int | 20 | 1ページあたりの件数（最大100） |
| `sort_by` | str | "updated_at" | ソートフィールド |
| `order` | str | "desc" | ソート順（"asc" / "desc"） |

> **⚠️ [NC-16] sort_by 有効値**: `sort_by` に指定可能なフィールドは以下の4つのみ:
> - `created_at`
> - `updated_at`
> - `last_name_kana`
> - `first_name_kana`
>
> Relationship/Tag によるソートは Phase 1 ではサポートしない。無効な値が指定された場合は 422 を返す。

---

## 分野 2: NameCard API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| 作成時のネスト | **一括作成**（contact_methods, relationship_ids, tag_ids をネストで送信） |
| ContactMethod.type | **enum**（17種類） |
| ContactMethod.label | **廃止**（マイグレーションでカラム削除） |
| 一覧での Relationship | **全て返す**（配列で full_path を含む） |
| 削除時の挙動 | **中間テーブルのみ削除**（Relationship/Tag 自体は残る） |

> **⚠️ [NC-2] マイグレーション必須タスク**: TODO 1（Alembic マイグレーション）に `ALTER TABLE contact_methods DROP COLUMN label` を含めること。

### ContactMethod.type enum 定義

```python
class ContactType(str, Enum):
    EMAIL = "email"
    TEL = "tel"          # 固定電話
    MOBILE = "mobile"    # 携帯電話
    FAX = "fax"
    WEBSITE = "website"
    X = "x"              # Twitter/X
    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"
    DISCORD = "discord"
    BOOTH = "booth"
    GITHUB = "github"
    LINKEDIN = "linkedin"
    FACEBOOK = "facebook"
    LINE = "line"
    TIKTOK = "tiktok"
    ADDRESS = "address"  # 物理的住所
    OTHER = "other"      # その他
```

### NameCard API エンドポイント仕様

#### `GET /api/v1/namecards`
- **Query**: `page`, `per_page`, `sort_by`, `order`, `tag_id`, `relationship_id`
- **Response 200**: 
```json
{
  "items": [
    {
      "id": 1,
      "first_name": "太郎",
      "last_name": "田中",
      "first_name_kana": "たろう",
      "last_name_kana": "たなか",
      "image_path": "/images/1.webp",
      "met_notes": "2025年展示会で出会った",
      "notes": "重要な取引先",
      "relationships": [
        {"id": 5, "name": "青年会長", "full_path": "建築士会/桑名支部/青年会長"}
      ],
      "tags": [{"id": 1, "name": "取引先"}],
      "created_at": "2026-02-28T06:21:55Z",
      "updated_at": "2026-02-28T06:21:55Z"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

#### `POST /api/v1/namecards`
- **Request Body**:
```json
{
  "first_name": "太郎",
  "last_name": "田中",
  "first_name_kana": "たろう",
  "last_name_kana": "たなか",
  "met_notes": "2025年展示会で出会った",
  "notes": "重要な取引先",
  "image_path": "/images/1.webp",
  "relationship_ids": [5, 8],
  "tag_ids": [1, 3],
  "contact_methods": [
    {"type": "email", "value": "tanaka@example.com", "is_primary": true},
    {"type": "mobile", "value": "090-1234-5678", "is_primary": false}
  ]
}
```
- **Response 201**: NameCardResponse（作成された名刺）
- **Response 400**: `{"detail": "Invalid relationship_id: 999"}`

#### `GET /api/v1/namecards/{id}`
- **Response 200**: NameCardResponse（contact_methods 含む）
- **Response 404**: `{"detail": "Namecard not found"}`

#### `PATCH /api/v1/namecards/{id}`
- **Request Body**: 全フィールド Optional
- **Response 200**: NameCardResponse
- **Response 404**: `{"detail": "Namecard not found"}`

> **⚠️ [NC-7] contact_methods 更新セマンティクス**: `contact_methods` は完全置換。送信した配列で既存データを全て置き換える。部分更新ではなく、配列全体の差し替え動作となる。`contact_methods` フィールドを送信しない場合は既存データを維持する。

#### `DELETE /api/v1/namecards/{id}`
- **Response 204**: No Content
- **Response 404**: `{"detail": "Namecard not found"}`

---

## 分野 3: Relationship API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| 削除機能 | **リーフノードのみ削除可**（子孫がある場合は 400 エラー） |
| ツリー形式 | **ネスト構造** |

### Relationship API エンドポイント仕様

#### `GET /api/v1/relationships`
- **Response 200**: ルートノード一覧（children 含まず）

> **[NC-5] ページネーションなし**: `GET /relationships` はページネーションなしで全レコードを返す。Relationship は通常少数のため。
```json
[
  {"id": 1, "name": "建築士会", "parent_id": null, "full_path": "建築士会"},
  {"id": 6, "name": "Jasca", "parent_id": null, "full_path": "Jasca"}
]
```

#### `GET /api/v1/relationships/tree`
- **Response 200**: ネスト構造
```json
[
  {
    "id": 1,
    "name": "建築士会",
    "full_path": "建築士会",
    "children": [
      {
        "id": 2,
        "name": "桑名支部",
        "full_path": "建築士会/桑名支部",
        "children": [
          {"id": 5, "name": "青年会長", "full_path": "建築士会/桑名支部/青年会長", "children": []}
        ]
      }
    ]
  }
]
```

#### `POST /api/v1/relationships`
- **Request Body**: `{"name": "新ノード", "parent_id": 2}`
- **Response 201**: RelationshipResponse
- **Response 400**: 循環参照時 `{"detail": "Circular reference detected"}`

#### `PATCH /api/v1/relationships/{id}`
- **Request Body**: `{"name": "新名称", "parent_id": 3}`（全フィールド Optional）
- **Response 200**: RelationshipResponse
- **Response 400**: 循環参照時

#### `DELETE /api/v1/relationships/{id}`
- **Response 204**: No Content（リーフノードのみ削除可）
- **Response 400**: 子孫がある場合 `{"detail": "Cannot delete node with children"}`
- **Response 404**: `{"detail": "Relationship not found"}`

---

## 分野 4: Tag API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| ページネーション | **なし**（タグは通常少ないため全件返す） |
| 重複防止 | **同一ユーザー内でタグ名はユニーク** |
| 削除時の挙動 | **中間テーブルのみ削除**（名刺は残る） |

### Tag API エンドポイント仕様

#### `GET /api/v1/tags`
- **Response 200**: タグ一覧
```json
[
  {"id": 1, "name": "取引先"},
  {"id": 2, "name": "友人"},
  {"id": 3, "name": "ゴルフ仲間"}
]
```

#### `POST /api/v1/tags`
- **Request Body**: `{"name": "重要"}`
- **Response 201**: TagResponse
- **Response 409**: 重複時 `{"detail": "Tag already exists"}`

#### `PATCH /api/v1/tags/{id}`
- **Request Body**: `{"name": "新しい名前"}`
- **Response 200**: TagResponse
- **Response 409**: 重複時

#### `DELETE /api/v1/tags/{id}`
- **Response 204**: No Content
- **Response 404**: `{"detail": "Tag not found"}`

---

## 分野 5: Search API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| テキスト検索対象 | 名前・Relationship full_path・ContactMethod value・notes/met_notes |
| 範囲フィルタ | created_at_start/end, updated_at_start/end |
| 複合検索 | テキストのみ / 範囲のみ / 両方 いずれも可 |

### Search API エンドポイント仕様

#### `GET /api/v1/search`
- **Query**:
  - `q` (string, optional): 検索キーワード
  - `tag_ids` (string, optional): カンマ区切りタグID
  - `relationship_ids` (string, optional): カンマ区切り関係ID

> **⚠️ [NC-10] カンマ区切り ID のパース仕様**:
> - `tag_ids=1,2,3` → `[1, 2, 3]` として処理
> - 数値に変換できない値（例: `tag_ids=1,abc,3`）→ 422 Validation Error
> - 空文字列（例: `tag_ids=`）→ フィルタ無効（全件対象）
> - 存在しない ID はフィルタ結果が0件になるだけでエラーにはしない
  - `created_at_start` (datetime, optional): 作成日時開始
  - `created_at_end` (datetime, optional): 作成日時終了
  - `updated_at_start` (datetime, optional): 更新日時開始
  - `updated_at_end` (datetime, optional): 更新日時終了
  - `page`, `per_page`, `sort_by`, `order`
- **Response 200**:
```json
{
  "items": [...],  // NameCardResponse と同じ形式
  "total": 25,
  "page": 1,
  "per_page": 20,
  "total_pages": 2
}
```

---

## 分野 6: Image/OCR API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| アップロードフロー | **2段階**（upload → process） |
| OCR開始タイミング | **アップロード直後**（非同期） |
| OCR結果取得 | **四隅確定時にまとめて返す**（ポーリングなし） |

### 処理フロー

```
1. POST /images/upload
   → 画像保存（一時）、upload_id 発行、OCR 非同期開始
   
2. フロント：四隅選択 UI 表示（OCR 並行実行中）
   （ユーザーが四隅を調整）

3. POST /images/process
   Request: { upload_id, corners: [{x, y}, {x, y}, {x, y}, {x, y}] }
   処理:
     - OCR 完了待ち（必要なら最大10秒）
     - OpenCV 遠近補正（四隅座標を使用）
     - Pillow WebP 変換（フル + サムネイル 300×188px）
     - 一時画像削除
   Response: { ocr_result, full_path, thumbnail_path }
   
4. フロント：「画像処理中...」→ レスポンスで完了
```

### Image/OCR API エンドポイント仕様

#### `POST /api/v1/images/upload`
- **Content-Type**: `multipart/form-data`
- **Request**: `file` (画像ファイル, 最大 20MB)
- **Response 202**:
```json
{
  "upload_id": "uuid-xxx",
  "message": "Upload successful. OCR started."
}
```
- **Response 413**: ファイルサイズ超過 `{"detail": "File too large. Maximum size is 20MB."}`

#### `POST /api/v1/images/process`
- **Request Body**:
```json
{
  "upload_id": "uuid-xxx",
  "corners": [
    {"x": 10, "y": 20},
    {"x": 200, "y": 15},
    {"x": 205, "y": 120},
    {"x": 8, "y": 125}
  ]
}
```
- **Response 200**:

> **⚠️ [NC-1] OCR レスポンス形式統一**: `ocr_result` は `NameCardCreate` スキーマと同一構造を使用する（下記「OCR レスポンス構造」セクション参照）。フラットな `emails/phones/mobiles` 配列は使用しない。

```json
{
  "ocr_result": {
    "first_name": "太郎",
    "last_name": "田中",
    "first_name_kana": "たろう",
    "last_name_kana": "たなか",
    "met_notes": null,
    "notes": null,
    "relationship_ids": [5],
    "tag_ids": [],
    "contact_methods": [
      {"type": "email", "value": "tanaka@example.com", "is_primary": true},
      {"type": "tel", "value": "0594-XX-XXXX", "is_primary": false},
      {"type": "mobile", "value": "090-XXXX-XXXX", "is_primary": false}
    ]
  },
  "image_path": "/images/123.webp",
  "thumbnail_path": "/images/123_thumb.webp"
}
```
- **Response 404**: upload_id 不正 `{"detail": "Upload not found"}`
- **Response 408**: OCR タイムアウト `{"detail": "OCR timeout. Please try again."}`

#### `GET /api/v1/images/{namecard_id}`
- **Response 200**: FileResponse (WebP)
- **Response 404**: `{"detail": "Image not found"}`

#### `GET /api/v1/images/{namecard_id}/thumbnail`
- **Response 200**: FileResponse (WebP, 300×188px)
- **Response 404**: `{"detail": "Image not found"}`

### OCR レスポンス構造（Gemini 2.5 Flash 出力）

**設計方針**: Gemini からの出力をそのまま `NameCardCreate` スキーマとして使用できる形式にする。

**Gemini に渡すコンテキスト（MCP 経由）**:
```json
{
  "existing_relationships": [
    {"id": 1, "full_path": "建築士会"},
    {"id": 2, "full_path": "建築士会/桑名支部"},
    {"id": 5, "full_path": "建築士会/桑名支部/青年会長"}
  ],
  "contact_types": ["email", "tel", "mobile", "fax", "website", "x", "instagram", ...]
}
```

**Gemini からの返答**（`NameCardCreate` と同一構造）:
```json
{
  "first_name": "太郎",
  "last_name": "田中",
  "first_name_kana": "たろう",
  "last_name_kana": "たなか",
  "met_notes": null,
  "notes": null,
  "relationship_ids": [5],
  "tag_ids": [],
  "contact_methods": [
    {"type": "email", "value": "tanaka@example.com", "is_primary": true},
    {"type": "mobile", "value": "090-1234-5678", "is_primary": false}
  ]
}
```

**フロント側の処理**:
1. OCR 結果を受け取る
2. ユーザーが内容を確認・編集
3. そのまま `POST /api/v1/namecards` に送信可能

---

## 分野 7: JSON Export/Import API 詳細

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| エクスポート形式 | **JSON**（CSV は廃止） |
| インポート形式 | **JSON**（CSV は廃止） |
| 理由 | ネストデータ（contact_methods 等）を完全保存するため |

### JSON Export/Import API エンドポイント仕様

#### `GET /api/v1/export/json`
- **Query**: なし（全名刺をエクスポート）
- **Response 200**: `application/json`
```json
{
  "exported_at": "2026-02-28T06:21:55Z",
  "version": "1.0",
  "relationships": [
    {"id": 1, "name": "建築士会", "parent_id": null},
    {"id": 2, "name": "桑名支部", "parent_id": 1},
    {"id": 5, "name": "青年会長", "parent_id": 2}
  ],
  "tags": [
    {"id": 1, "name": "取引先"},
    {"id": 2, "name": "友人"}
  ],
  "namecards": [
    {
      "id": 1,
      "first_name": "太郎",
      "last_name": "田中",
      "first_name_kana": "たろう",
      "last_name_kana": "たなか",
      "image_path": "/images/1.webp",
      "met_notes": "2025年展示会で出会った",
      "notes": "重要な取引先",
      "relationship_ids": [5],
      "tag_ids": [1],
      "contact_methods": [
        {"type": "email", "value": "tanaka@example.com", "is_primary": true}
      ],
      "created_at": "2026-02-28T06:21:55Z",
      "updated_at": "2026-02-28T06:21:55Z"
    }
  ]
}
```

#### `POST /api/v1/import/json`
- **Content-Type**: `application/json`
- **Request Body**: 上記と同じ形式
- **Response 200**:
```json
{
  "imported": {
    "relationships": 5,
    "tags": 3,
    "namecards": 10
  },
  "skipped": {
    "relationships": 0,
    "tags": 1,
    "namecards": 0
  },
  "errors": []
}
```
- **Response 400**: `{"detail": "Invalid JSON format"}`

### インポート時の競合処理

> **⚠️ [NC-8] インポート順序**: Relationship のインポートはトポロジカル順序（親→子）で行うこと。子ノードの `parent_id` が参照する親ノードが先にインサートされている必要がある。エクスポート時に `parent_id` 昇順（null が先頭）で出力することで、インポート時にそのまま順次処理可能。

| ケース | 処理 |
|--------|------|
| 同 ID の Relationship 存在 | **スキップ**（既存を優先） |
| 同名 Tag 存在 | **スキップ** |
| 同 ID の NameCard 存在 | **スキップ**（上書きしない） |
| ID 未指定 | **新規作成**（新 ID 採番） |

---

## 分野 8: テスト計画

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| テストケース数 | **165 件** |
| テストフレームワーク | pytest + TestClient |
| テストファースト | **テストを先に作成 → 実装でグリーンにする** |
| テスト変更 | **ユーザー確認必須** |

> **⚠️ [NC-3] pytest ファイル命名パターン**: 現在の `pyproject.toml` は `python_files = ["*_test.py"]` となっているが、test_cases.md のテストファイルは `test_*.py` 形式。`pyproject.toml` を以下に更新すること:
> ```toml
> [tool.pytest.ini_options]
> python_files = ["test_*.py"]
> ```

### テスト構成

```
backend/tests/
├── conftest.py                     # DB, TestClient, fixture
├── test_auth.py                    # 11 ケース
├── test_namecards.py               # 45 ケース
├── test_relationships.py           # 29 ケース
├── test_tags.py                    # 20 ケース
├── test_search.py                  # 20 ケース
├── test_images.py                  # 22 ケース
├── test_export_import.py           # 16 ケース
└── test_health.py                  # 2 ケース
```

### テストケース一覧

詳細は [`docs/plans/test_cases.md`](./test_cases.md) を参照。

> **⚠️ [NC-9] 追加テストケース**: test_images.py に以下のセキュリティテストを追加すること:
> - **test_process_image_other_users_upload_id**: ユーザー A がアップロードした `upload_id` をユーザー B が `POST /images/process` で使用した場合に 404 を返すこと。

> **[NC-13] Health エンドポイントのパス**: Health チェックは `/health`（ルート）に配置される。`/api/v1/health` ではない点に注意。test_health.py のリクエスト先は `GET /health` とする。

### 共通 Fixture

| Fixture | スコープ | 説明 |
|---------|---------|------|
| `db_session` | function | テストごとにロールバックされる DB セッション |
| `client` | function | TestClient + DB セッション override |
| `user_and_token` | function | 登録済みユーザー + JWT トークン |
| `auth_headers` | function | Authorization ヘッダー |
| `other_user_and_token` | function | 別ユーザー（権限テスト用） |
| `other_auth_headers` | function | 別ユーザーの認証ヘッダー（`{"Authorization": "Bearer <other_token>"}`） |
| `sample_relationship_tree` | function | 3 階層のツリー |
| `sample_tags` | function | 3 つのタグ |
| `sample_namecard` | function | 名刺 1 件（全関連付き） |

---

## 分野 9: インフラ

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| pg_bigm Docker | **カスタム Dockerfile** でビルド |
| Google Gemini SDK | **`google-genai`**（`google-generativeai` は非推奨） |

> **⚠️ [NC-4] ルーター登録の追加が必要**: 現在の `backend/app/api.py` には auth, images, namecards, search のルーターのみ登録されている。以下のルーターを追加登録すること:
> - `relationships` — `app.routers.relationships`
> - `tags` — `app.routers.tags`
> - `export` — `app.routers.export`
> - `import` — `app.routers.import_router`（`import` は Python 予約語のため別名）

### pyproject.toml 追加依存パッケージ

> **[NC-14] psycopg2 → psycopg 移行**: 現在のコードベースは `psycopg2-binary` を使用しているが、Phase 1 では `psycopg[binary]`（v3）に移行する。SQLAlchemy 接続文字列を `postgresql+psycopg://` に変更すること（`postgresql+psycopg2://` からの変更）。

```toml
[project]
dependencies = [
    # Web framework
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "python-multipart>=0.0.18",

    # Google Gemini API (NEW SDK - google-generativeai is deprecated)
    "google-genai>=1.20",

    # Image processing
    "opencv-python-headless>=4.13",
    "Pillow>=12.1",

    # Database
    "psycopg[binary]>=3.2",

    # Config
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.2",
    "pytest-asyncio>=0.25",
    "httpx>=0.28",
    "pytest-cov>=6.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
python_files = ["test_*.py"]
```

### pg_bigm Dockerfile 構成

```dockerfile
# backend/Dockerfile.db (または docker/postgres/Dockerfile)
FROM postgres:16-alpine

# pg_bigm ビルドに必要なパッケージ
RUN apk add --no-cache \
    build-base \
    postgresql-dev \
    git \
    gcc \
    make

# pg_bigm クローン & ビルド
RUN git clone https://github.com/pgbigm/pg_bigm.git /tmp/pg_bigm \
    && cd /tmp/pg_bigm \
    && make USE_PGXS=1 \
    && make USE_PGXS=1 install \
    && rm -rf /tmp/pg_bigm

# shared_preload_libraries 設定は docker-compose.yml で行う
```

### docker-compose.yml 更新

```yaml
services:
  db:
    build:
      context: ./docker/postgres
      dockerfile: Dockerfile
    environment:
      POSTGRES_DB: namecard
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    command: postgres -c shared_preload_libraries=pg_bigm
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### Gemini API 使用例（新 SDK）

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=settings.GEMINI_API_KEY)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[...],
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=NameCardCreate,  # Pydantic モデルを直接指定可能
    ),
)
```

---

## 改訂履歴

| 日時 | 内容 |
|------|------|
| 2026-02-28 | インタビュー開始 |
| 2026-02-28 | Momus レビュー指摘対応: NC-1〜NC-16 全件修正 |
| 2026-02-28 | フロントエンド計画インタビュー完了 |
| 2026-02-28 | フロントエンド計画レビュー修正: ダークモード属性を `html.dark` に変更、ThemeContext 削除、モーダル編集方式追記、Zod スキーマ追加（search/import）、E2E テスト追加（relationships/tags） |
| 2026-02-28 | Momus 最終レビュー完了: ACCEPTABLE（軽微指摘 NC-17〜NC-22 付き） |
| 2026-03-01 | NC-17〜NC-20 軽微指摘修正: FE テスト集計修正（121/174）、auth fixture username→email、backend_test_cases.md→test_cases.md 参照修正 |

---

# フロントエンド計画

## 分野 10: プロジェクト構成

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| レンダリング方式 | **SSR**（サーバーサイドレンダリング） |
| ルーター | **App Router**（Next.js 14+ 推奨） |
| ディレクトリ構成 | **src/ 配下**（app/, components/, lib/, hooks/, styles/） |

---

## 分野 11: ページ・ルーティング

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| 追加ページ | **インポート/エクスポートページ**、**ヘルプページ** |
| 名刺編集 | **モーダル方式**（詳細ページ上で `NameCardEditDialog` を表示、専用ルートは設けない） |

### ページ構成

```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (main)/
│   ├── layout.tsx           # 認証済みレイアウト
│   ├── page.tsx             # 名刺一覧（/）
│   ├── namecards/
│   │   ├── [id]/page.tsx    # 名刺詳細
│   │   └── new/page.tsx     # 名刺登録
│   ├── relationships/page.tsx
│   ├── tags/page.tsx
│   ├── import-export/page.tsx
│   └── help/page.tsx
└── layout.tsx               # ルートレイアウト
```

---

## 分野 12: コンポーネント設計

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| shadcn/ui 方針 | **コピーして SCSS 化**（Tailwind は完全削除） |

### コンポーネント構成

```
src/components/
├── ui/                      # SCSS 化した shadcn/ui コンポーネント
│   ├── Button/
│   ├── Input/
│   ├── Dialog/
│   ├── Select/
│   └── ...
├── layout/
│   ├── Header/
│   ├── Sidebar/
│   └── Footer/
├── namecard/
│   ├── NameCardList/
│   ├── NameCardItem/
│   ├── NameCardForm/
│   ├── NameCardDetail/
│   └── NameCardEditDialog/  # 詳細ページ上のモーダル編集
├── relationship/
│   ├── RelationshipTree/
│   └── RelationshipSelect/
├── tag/
│   ├── TagList/
│   └── TagSelect/
├── camera/
│   ├── CameraCapture/
│   └── CornerSelector/
└── search/
    └── SearchBar/
```

---

## 分野 13: 状態管理

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| グローバル状態 | **Context API** |

### Context 構成

```typescript
// src/lib/contexts/
├── AuthContext.tsx      // ユーザー認証状態
└── ToastContext.tsx     // 通知表示
```

> **注記**: ダークモードは `next-themes` の `ThemeProvider` で管理するため、独自の ThemeContext は不要。

---

## 分野 14: API クライアント

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| HTTP クライアント | **axios** |
| フォーム管理 | **React Hook Form + Zod** |

### API クライアント構成

```typescript
// src/lib/api/
├── client.ts            // axios インスタンス（JWT 自動付与）
├── auth.ts              // 認証 API
├── namecards.ts         // 名刺 API
├── relationships.ts     // 関係性 API
├── tags.ts              // タグ API
├── search.ts            // 検索 API
├── images.ts            // 画像 API
└── export-import.ts     // JSON API
```

### スキーマ（Zod）

```typescript
// src/lib/schemas/
├── auth.ts              // LoginSchema, RegisterSchema
├── namecard.ts          // NameCardCreateSchema, NameCardUpdateSchema
├── relationship.ts      // RelationshipCreateSchema
├── tag.ts               // TagCreateSchema
├── contact-method.ts    // ContactMethodSchema（type enum 含む）
├── search.ts            // SearchQuerySchema
└── import.ts            // ImportDataSchema
```

---

## 分野 15: ダークモード

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| 実装方式 | **next-themes** |

### テーマ変数

```scss
// src/styles/_variables.scss
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  // ...
}

html.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  // ...
}
```

---

## 分野 16: フロントエンドテスト

### 決定事項

| 項目 | 決定内容 |
|------|---------|
| テスト戦略 | **Vitest + Playwright** |

### テスト構成

```
frontend/
├── src/
│   └── __tests__/        # Vitest ユニットテスト
│       ├── components/
│       ├── hooks/
│       └── lib/
├── e2e/                  # Playwright E2E テスト
│   ├── auth.spec.ts
│   ├── namecards.spec.ts
│   ├── relationships.spec.ts
│   ├── tags.spec.ts
│   ├── search.spec.ts
│   └── ocr.spec.ts
└── playwright.config.ts
```

### E2E テストシナリオ

1. **認証フロー**: ログイン → 名刺一覧表示
2. **名刺 CRUD**: 作成 → 詳細表示 → 編集 → 削除
3. **OCR フロー**: カメラ撮影 → 四隅選択 → OCR 結果表示 → 保存
4. **検索**: キーワード入力 → 結果表示 → フィルタ適用
5. **JSON エクスポート/インポート**: エクスポート → ファイル確認
6. **関係性 CRUD**: ツリー表示 → ノード作成 → 名前変更 → 削除
7. **タグ CRUD**: 一覧表示 → タグ作成 → 名前変更 → 削除

---

## フロントエンド依存パッケージ

```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "react-dom": "^18",
    "axios": "^1.6",
    "react-hook-form": "^7",
    "zod": "^3",
    "@hookform/resolvers": "^3",
    "next-themes": "^0.2",
    "lucide-react": "^0.300"
  },
  "devDependencies": {
    "typescript": "^5",
    "sass": "^1.69",
    "vitest": "^1",
    "@testing-library/react": "^14",
    "@playwright/test": "^1.40"
  }
}
```

---

## フロントエンド計画ステータス更新

| # | 分野 | ステータス | 決定事項数 |
|---|------|-----------|-----------|
| 10 | プロジェクト構成 | ✅ 完了 | 3項目 |
| 11 | ページ・ルーティング | ✅ 完了 | 2項目 |
| 12 | コンポーネント設計 | ✅ 完了 | 1項目 |
| 13 | 状態管理 | ✅ 完了 | 1項目 |
| 14 | API クライアント | ✅ 完了 | 2項目 |
| 15 | ダークモード | ✅ 完了 | 1項目 |
| 16 | フロントエンドテスト | ✅ 完了 | 1項目 |

---

# Momus 最終レビュー（全計画 + BE/FE テスト）

> レビュー日: 2026-02-28
> レビュー対象: momus.md（API仕様+FE仕様）、test_cases.md（BE 165件）、frontend_test_cases.md（FE 174件）、namecard_manager_phase1.md（実装計画）

## Summary

**🟢 ACCEPTABLE** — 実装開始可能（軽微指摘 6 件は実装時に対応すること）

全体として、API 仕様・バックエンドテスト・フロントエンド仕様・フロントエンドテストの 4 文書間の整合性は高い。カバレッジも十分であり、テストファースト開発を開始するに足る品質。以下に詳細分析と軽微指摘を記す。

---

## テストカバレッジ分析

### バックエンドテスト（165件）

| リソース | 正常系 | 認証・認可 | バリデーション | ビジネスロジック | エッジケース | 合計 |
|----------|--------|-----------|---------------|----------------|------------|------|
| Auth | 3 | — | 3 | — | 5 | 11 |
| NameCard | 18 | 9 | 5 | 4 | 9 | 45 |
| Relationship | 10 | 8 | 2 | 6 | 3 | 29 |
| Tag | 6 | 7 | 2 | 3 | 2 | 20 |
| Search | 15 | 2 | — | — | 3 | 20 |
| Image/OCR | 6 | 6 | 4 | 3 | 3 | 22 |
| Export/Import | 8 | 3 | 2 | 3 | — | 16 |
| Health | 1 | — | — | — | 1 | 2 |
| **合計** | **67** | **35** | **18** | **19** | **26** | **165** |

**評価**: ✅ 良好。全 API エンドポイントに対して正常系・異常系・エッジケースが網羅されている。NC-9（他ユーザーの upload_id テスト）も含まれている。sort_by 無効値テストも test_cases.md には明記がないが、NC-16 で 422 を返す仕様は確定済みであり、実装時に追加可能。

### フロントエンドテスト（実数 174件）

> **⚠️ [NC-17] Vitest 集計表の算術エラー**: 集計表は合計 **116** と記載しているが、テーブル行の数値を合算すると **122** になる。さらに NameCardForm の行は **16** と記載しているが、本文中の named tests を数えると **15** である。正しい Vitest 合計は **121**、Playwright **53** で **総計 174** と推定される。frontend_test_cases.md のテーブルを修正すること。

| テスト種別 | 記載値 | 実数（推定） |
|-----------|--------|------------|
| Vitest | 116 | 121 |
| Playwright | 53 | 53 |
| **合計** | **169** | **174** |

**内訳（実数ベース）**:

| カテゴリ | テスト数 |
|---------|---------|
| UI コンポーネント（Button/Input/Dialog/Select） | 15 |
| NameCard（List/Item/Form/EditDialog） | 30 |
| Relationship（Tree/Select） | 12 |
| Tag（List/Select） | 10 |
| Camera（Capture/CornerSelector） | 8 |
| Search（SearchBar） | 4 |
| Hooks（useAuth/useToast） | 7 |
| API クライアント（client/namecards/search/images） | 11 |
| Zod スキーマ（7ファイル） | 24 |
| **Vitest 小計** | **121** |
| Playwright E2E（7ファイル） | 53 |
| **総計** | **174** |

---

## アライメントチェック

### E2E ↔ バックエンド API アライメント

| 機能領域 | Backend API | E2E spec | 整合? | 備考 |
|---------|-------------|----------|-------|------|
| 認証（登録） | `POST /auth/register` → 201 | auth.spec.ts: register_and_login_flow, register_duplicate, register_invalid | ✅ | |
| 認証（ログイン） | `POST /auth/login` → 200 + JWT | auth.spec.ts: login_success, login_wrong_password, login_nonexistent | ✅ | |
| 認証（ログアウト） | クライアント側トークン削除 | auth.spec.ts: logout_flow | ✅ | |
| 認証（保護ページ） | 401 on all protected endpoints | auth.spec.ts: protected_page_redirect | ✅ | |
| 名刺作成 | `POST /namecards` → 201 | namecards.spec.ts: create_minimal, create_full, create_with_contacts | ✅ | |
| 名刺一覧 | `GET /namecards` → paginated | namecards.spec.ts: list_pagination, list_shows_thumbnail | ✅ | |
| 名刺詳細 | `GET /namecards/{id}` → 200 | namecards.spec.ts: view_detail | ✅ | |
| 名刺編集 | `PATCH /namecards/{id}` → 200 | namecards.spec.ts: edit_modal, edit_cancel | ✅ | モーダル方式 |
| 名刺削除 | `DELETE /namecards/{id}` → 204 | namecards.spec.ts: delete | ✅ | |
| Relationship ツリー | `GET /relationships/tree` → nested | relationships.spec.ts: tree_display | ✅ | |
| Relationship 作成 | `POST /relationships` → 201 | relationships.spec.ts: add_root, add_child | ✅ | |
| Relationship 更新 | `PATCH /relationships/{id}` → 200 | relationships.spec.ts: rename | ✅ | |
| Relationship 削除 | `DELETE /relationships/{id}` → 204/400 | relationships.spec.ts: delete_leaf, delete_parent_error | ✅ | |
| タグ一覧 | `GET /tags` → array | tags.spec.ts: list_display | ✅ | |
| タグ作成 | `POST /tags` → 201/409 | tags.spec.ts: create, create_duplicate_error | ✅ | |
| タグ更新 | `PATCH /tags/{id}` → 200 | tags.spec.ts: rename | ✅ | |
| タグ削除 | `DELETE /tags/{id}` → 204 | tags.spec.ts: delete | ✅ | |
| 検索（テキスト） | `GET /search?q=...` | search.spec.ts: by_name, partial_match, by_kana | ✅ | |
| 検索（フィルタ） | `GET /search?tag_ids=&relationship_ids=` | search.spec.ts: filter_by_tag, filter_by_relationship, combined | ✅ | |
| 画像アップロード | `POST /images/upload` → 202 | ocr.spec.ts: camera_to_corner | ✅ | |
| 画像処理+OCR | `POST /images/process` → 200/408 | ocr.spec.ts: corner_to_ocr, ocr_timeout_error | ✅ | |
| OCR→保存 | process → prefill → `POST /namecards` | ocr.spec.ts: ocr_edit_and_save, ocr_full_flow | ✅ | |
| JSON エクスポート | `GET /export/json` → 200 | export-import.spec.ts: export_download, export_contains_all, export_empty | ✅ | |
| JSON インポート | `POST /import/json` → 200/400 | export-import.spec.ts: import_upload, import_verify, roundtrip, invalid_format | ✅ | |
| Health | `GET /health` → 200 | — | ⚠️ | E2E テストなし（バックエンドテストのみ。問題なし） |

**評価**: ✅ **全 API エンドポイントが E2E テストでカバーされている**。Health エンドポイントのみ E2E なしだが、バックエンドテストで十分。

### コンポーネント ↔ API データ形状アライメント

| コンポーネント | 使用するデータ形状 | API レスポンス形状 | 整合? |
|--------------|------------------|------------------|-------|
| NameCardItem | `{first_name, last_name, relationships[{full_path}], tags[{name}], image_path}` | GET /namecards items[] | ✅ |
| NameCardForm | `{first_name, last_name, ..., contact_methods[{type, value, is_primary}], relationship_ids[], tag_ids[]}` | POST /namecards request body | ✅ |
| NameCardEditDialog | NameCardResponse → NameCardForm prefill | GET /namecards/{id} → PATCH | ✅ |
| RelationshipTree | `{id, name, full_path, children[]}` | GET /relationships/tree | ✅ |
| RelationshipSelect | ツリーからノード選択 → relationship_ids[] | POST/PATCH /namecards body | ✅ |
| TagList | `{id, name}[]` | GET /tags | ✅ |
| TagSelect | タグ選択 → tag_ids[] | POST/PATCH /namecards body | ✅ |
| SearchBar | `q` string → paginated result | GET /search?q= | ✅ |
| CameraCapture | image blob → upload | POST /images/upload multipart | ✅ |
| CornerSelector | `[{x,y}×4]` → process | POST /images/process body | ✅ |
| OCR prefill | ocr_result (NameCardCreate形状) → NameCardForm | POST /images/process response | ✅ |

**評価**: ✅ **全コンポーネントのデータ形状が API 仕様と整合している**。特に NC-1（OCR レスポンス = NameCardCreate 形状）と NC-7（contact_methods 完全置換セマンティクス）が正しく反映されている。

### Zod スキーマ ↔ Pydantic スキーマアライメント

| Zod スキーマ | Pydantic スキーマ | フィールド整合? |
|-------------|------------------|---------------|
| LoginSchema | — (FastAPI OAuth2) | ✅ |
| RegisterSchema | UserCreate | ✅ |
| NameCardCreateSchema | NameCardCreate | ✅ |
| NameCardUpdateSchema | NameCardUpdate (all Optional) | ✅ |
| ContactMethodSchema | ContactMethodCreate (type enum 17種) | ✅ |
| RelationshipCreateSchema | RelationshipCreate | ✅ |
| TagCreateSchema | TagCreate | ✅ |
| SearchQuerySchema | Search query params | ✅ |
| ImportDataSchema | Import JSON body | ✅ |

**評価**: ✅ Zod スキーマ 7 ファイルが Pydantic スキーマと 1:1 対応。

---

## ギャップ分析

### 指摘事項

#### NC-17: Vitest 集計表の算術エラー（軽微）

**問題**: `frontend_test_cases.md` の Vitest 集計表:
- テーブル行の合計は **122** だが、記載は **116**（6 件の差分）
- NameCardForm: テーブルは **16** だが、本文の named tests は **15**
- 正しい Vitest 合計は **121**、総計は **174**

**対応**: 実装時に `frontend_test_cases.md` の集計テーブルを修正する。

#### NC-18: API クライアントテストの不足箇所（軽微）

**問題**: Vitest の API クライアントテストに以下が不足:
- `relationships` API のテスト（`relationshipApi.list()`, `relationshipApi.create()` 等）
- `tags` API のテスト（`tagApi.list()`, `tagApi.create()` 等）
- `export-import` API のテスト（`exportApi.exportJson()`, `importApi.importJson()`）

namecards, search, images のみカバーされている。

**対応**: 実装時に追加するか、E2E テストでカバー済みとして許容する。E2E で全フロー検証されているため、ブロッカーではない。

#### NC-19: sort_by 無効値テスト（軽微）

**問題**: momus.md NC-16 で `sort_by` に無効値が指定された場合 422 を返す仕様が確定しているが、test_cases.md にこの専用テストケースがない。

**対応**: `test_namecards.py` のエッジケースに `test_list_namecards_invalid_sort_by` を実装時に追加する。

#### NC-20: date range フィルタの search E2E テスト不足（軽微）

**問題**: バックエンドテストでは `test_search_filter_by_created_at_range` / `test_search_filter_by_updated_at_range` があるが、フロントエンド（E2E / Vitest）に日付範囲フィルタの UI テストがない。

**対応**: Phase 1 では日付範囲フィルタの UI を実装するかどうかが不明確。もし UI を実装するなら E2E テストを追加すべき。UI を実装しない場合（API のみ対応）はバックエンドテストで十分。

#### NC-21: NameCardDetail コンポーネントの Vitest テスト不足（軽微）

**問題**: momus.md のコンポーネント構成に `NameCardDetail` が含まれるが、Vitest のコンポーネントテストに `NameCardDetail` 用のテストがない。E2E（namecards.spec.ts: view_detail）でカバーはされている。

**対応**: 実装時に判断。E2E でカバー済みのため、ブロッカーではない。

#### NC-22: layout コンポーネント（Header/Sidebar/Footer）の Vitest テスト不在（軽微）

**問題**: momus.md のコンポーネント構成に `layout/Header`, `layout/Sidebar`, `layout/Footer` があるが、Vitest テストがない。

**対応**: レイアウトコンポーネントは E2E テストで間接的に検証される。ユニットテストは必須ではない。

---

## 4文書間クロスリファレンス整合性

| チェック項目 | momus.md | test_cases.md | frontend_test_cases.md | phase1.md | 整合? |
|-------------|----------|---------------|----------------------|-----------|-------|
| CSV→JSON 変更 | NC-12 ✅ | export_import ✅ | export-import.spec.ts ✅ | TODO 9 ✅ | ✅ |
| ContactMethod.label 廃止 | NC-2 ✅ | テストにlabel無し ✅ | スキーマにlabel無し ✅ | TODO 1 ✅ | ✅ |
| ContactMethod.type enum 17種 | 分野2 ✅ | invalid_type テスト ✅ | type_enum テスト ✅ | TODO 2 ✅ | ✅ |
| OCR = NameCardCreate形状 | NC-1 ✅ | ocr_result_format ✅ | ocr_to_form prefill ✅ | TODO 8 ✅ | ✅ |
| contact_methods 完全置換 | NC-7 ✅ | update_contact_methods ✅ | (implicit) ✅ | — | ✅ |
| 422 FastAPIデフォルト形式 | NC-15 ✅ | 冒頭注記 ✅ | — | — | ✅ |
| /health パス | NC-13 ✅ | GET /health ✅ | — | — | ✅ |
| pytest python_files | NC-3 ✅ | test_*.py 形式 ✅ | — | pyproject.toml 更新 ✅ | ✅ |
| psycopg v3 移行 | NC-14 ✅ | — | — | TODO 1 ✅ | ✅ |
| Tailwind 禁止 | 分野12 ✅ | — | SCSS 前提 ✅ | Guardrails ✅ | ✅ |
| モーダル編集方式 | 分野11 ✅ | — | EditDialog テスト ✅ | TODO 11 ✅ | ✅ |
| next-themes (html.dark) | 分野15 ✅ | — | — | TODO 10 ✅ | ✅ |
| Relationship トポロジカル順序 | NC-8 ✅ | roundtrip テスト ✅ | roundtrip E2E ✅ | TODO 9 ✅ | ✅ |
| 他ユーザー upload_id テスト | NC-9 ✅ | test_process_other_users ✅ | — | — | ✅ |

**評価**: ✅ **4 文書間に矛盾・不整合なし**。全 NC 指摘事項が各文書に反映済み。

---

## 判定

### 🟢 ACCEPTABLE — 実装開始可

**根拠**:
1. **API 仕様**: 全エンドポイントのリクエスト/レスポンス形式、ステータスコード、エラーメッセージが確定済み
2. **バックエンドテスト（165件）**: 正常系 67 + 認証 35 + バリデーション 18 + ビジネスロジック 19 + エッジケース 26 で十分な網羅性
3. **フロントエンドテスト（実数 174件）**: Vitest 121（UI/コンポーネント/フック/API/スキーマ）+ Playwright E2E 53 で全機能をカバー
4. **E2E ↔ Backend 整合**: 全 API エンドポイントが E2E シナリオに対応
5. **データ形状整合**: コンポーネント ↔ API ↔ Zod ↔ Pydantic が一貫
6. **4文書間整合**: NC-1〜NC-16 の全指摘が各文書に反映済み

**実装時に対応すべき軽微指摘（NC-17〜NC-22）**:
- NC-17: frontend_test_cases.md 集計表の算術修正
- NC-18: relationships/tags/export-import API クライアントテスト追加検討
- NC-19: sort_by 無効値テスト追加
- NC-20: 日付範囲フィルタ UI の有無を確定
- NC-21: NameCardDetail ユニットテスト追加検討
- NC-22: Layout コンポーネントテストは E2E でカバー済み（追加不要）

