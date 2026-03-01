# 名刺管理アプリ 設計意思決定ドキュメント

> 作成日: 2026-02-28
> 対象: nameCardManager — 個人用・小規模名刺管理アプリ
> 技術スタック: FastAPI (Python 3.14) + PostgreSQL 16 + React (Next.js) + shadcn/ui + SCSS（⚠️ Tailwind 不使用）

---

## 目次

1. [意思決定ポイント一覧](#意思決定ポイント一覧)
   - [1. 入力方法（OCR）](#1-入力方法ocr)
   - [2. 画像管理](#2-画像管理)
   - [3. 検索・フィルタリング](#3-検索フィルタリング)
   - [4. データモデル拡張](#4-データモデル拡張)
   - [5. エクスポート/インポート](#5-エクスポートインポート)
   - [6. セキュリティ・プライバシー](#6-セキュリティプライバシー)
   - [7. バックアップ](#7-バックアップ)
   - [8. フロントエンド技術スタック](#8-フロントエンド技術スタック)
   - [9. デプロイ・インフラ](#9-デプロイインフラ)
   - [10. CI/CD](#10-cicd)
   - [11. Python バージョン](#11-python-バージョン)
   - [12. テスト戦略](#12-テスト戦略)
   - [13. API 設計方針](#13-api-設計方針)
   - [14. エラーメッセージ](#14-エラーメッセージ)
   - [15. 国際化（i18n）](#15-国際化i18n)
   - [16. 画像アップロード制限](#16-画像アップロード制限)
   - [17. 名刺枚数制限](#17-名刺枚数制限)
2. [推奨される機能優先順位](#推奨される機能優先順位)
3. [技術的推奨事項](#技術的推奨事項)
4. [競合アプリ機能比較](#競合アプリ機能比較)

---

## 意思決定ポイント一覧

### 1. 入力方法（OCR）

名刺データをどう入力するか。手入力のみか、OCR で自動抽出するか。

#### 選択肢比較

| 選択肢 | 日本語精度 | コスト (月200枚) | プライバシー | 構造化抽出 | 実装工数 |
|---|---|---|---|---|---|
| **手入力のみ** | N/A | ¥0 | ✅ 完全 | N/A | 最小 |
| **Tesseract（ローカル）** | ⭐⭐ 低〜中 | ¥0 | ✅ 完全ローカル | ❌ 生テキストのみ | 大（前処理パイプライン必要） |
| **Google Cloud Vision** | ⭐⭐⭐⭐ 高 | ¥0（月1,000件無料枠） | ☁️ Google送信 | △ テキスト+座標のみ | 中（フィールド抽出ロジック別途） |
| **OpenAI Vision (GPT-4o mini)** | ⭐⭐⭐⭐⭐ 最高 | ~¥30-90/月 | ☁️ OpenAI送信 | ✅ 構造化JSON直接出力 | **最小** |
| **Gemini 2.5 Flash** | ⭐⭐⭐⭐⭐ 最高 | 無料枠あり | ☁️ Google送信 | ✅ 構造化JSON直接出力 | **最小** |
| **Azure Document Intelligence** | ⭐⭐⭐⭐ 高 | ¥0（月500件無料枠） | ☁️ Azure送信 | ✅ 名刺モデルあり | 中 |
| **AWS Textract** | ❌ | — | — | — | — |

> **注意**: AWS Textract は日本語を公式サポートしていない。Azure の名刺モデル (`prebuilt-businessCard`) は v4.0 で非推奨化。

#### 各選択肢の詳細

- **手入力のみ**
  - メリット: 実装不要、プライバシー完全保護、精度100%（人間が入力）
  - デメリット: ユーザー体験が悪い、大量登録に時間がかかる
  - 適するケース: MVP フェーズ、OCR を後から追加する前提

- **Tesseract OCR（ローカル）**
  - メリット: 無料、完全ローカル処理、プライバシー最強
  - デメリット: 日本語精度が低い（特に混在テキスト）、画像前処理（二値化、傾き補正、DPI調整）が必須、フィールド抽出NLPパイプラインを自前構築する必要あり
  - 適するケース: オフライン必須、プライバシー絶対条件

- **Google Cloud Vision API**
  - メリット: 日本語精度高い、月1,000件無料、CJK言語自動検出、縦書き対応
  - デメリット: 画像をGoogleに送信、テキスト抽出のみ（フィールド分類は自前）
  - 適するケース: 無料枠を重視、フィールド抽出ロジックを自前で書ける場合

- **OpenAI Vision API (GPT-4o mini)**
  - メリット: 最高精度、Pydantic スキーマで構造化JSON直接出力、前処理不要、レイアウト認識（縦書き等）、20行程度で実装可能
  - デメリット: クラウド送信（ただしAPI利用データはトレーニングに未使用）、ハルシネーションリスク（稀に存在しないデータを生成）
  - コスト: GPT-4o mini = ~$0.002/枚 → 200枚/月 ≈ $0.40（≈¥60）
  - 適するケース: 個人用アプリでも有力な選択肢

- **Gemini 2.5 Flash** ⭐推奨（決定済み）
  - メリット: 最高精度、構造化JSON直接出力、前処理不要、レイアウト認識（縦書き等）、無料枠が充実、高速
  - デメリット: クラウド送信（Google に送信）、ハルシネーションリスク
  - コスト: 無料枠あり、超過分も低コスト
  - 適するケース: **個人用アプリの最適解**

- **Azure AI Document Intelligence**
  - メリット: 名刺専用モデルあり（`ja-JP` 対応）、月500件無料、構造化フィールド抽出
  - デメリット: **名刺モデルが v4.0 で非推奨化** → 将来的に汎用モデル+自前抽出が必要に
  - 適するケース: 短期的にはよいが長期リスクあり

#### 🎯 決定事項

**Phase 1 から Gemini 2.5 Flash を導入（必須）**

理由:
1. Gemini 2.5 Flash は 1 API コールで構造化データを返すため、OCR→NLP パイプラインが不要
2. 無料枠が充実しており個人用として最適
3. 名刺撮影→OCR→確認・編集のフローを Phase 1 で提供する

---

### 2. 画像管理

名刺の画像をどう保存・処理するか。

#### 選択肢比較

| 選択肢 | 複雑度 | コスト | バックアップ | パフォーマンス | 外部依存 |
|---|---|---|---|---|---|
| **ローカルファイルシステム（Docker Volume）** | ⭐ 最低 | ¥0 | `tar` で圧縮 | ⭐⭐⭐⭐⭐ 最速 | なし |
| **オブジェクトストレージ（S3/R2）** | ⭐⭐⭐ 中 | 微少 | 組み込み冗長化 | ⭐⭐⭐ ネットワーク遅延 | AWS/CF |
| **PostgreSQL BLOB（bytea）** | ⭐⭐ 低 | ¥0 | `pg_dump` に含む | ⭐⭐ DB肥大化 | なし |

#### 各選択肢の詳細

- **ローカルファイルシステム + Docker Named Volume** ⭐推奨
  - メリット: ゼロレイテンシ、新規依存なし、`FileResponse` で直接配信、`docker cp` / `tar` でバックアップ
  - デメリット: 単一ホスト制約、手動バックアップが必要
  - ディレクトリ構造: `/data/images/{user_id}/{namecard_id}_{variant}.webp`

- **オブジェクトストレージ（S3/R2/MinIO）**
  - メリット: スケーラブル、組み込み冗長化、CDN配信可能
  - デメリット: `boto3` 依存追加、ネットワーク遅延、認証管理の複雑化
  - コスト: Cloudflare R2 = $0.015/GB/月（エグレス無料）、S3 = $0.023/GB/月 + エグレス
  - 適するケース: マルチサーバー展開や CDN 配信が必要になった時

- **PostgreSQL BLOB**
  - メリット: `pg_dump` 一発で全データバックアップ、トランザクション整合性
  - デメリット: DB 肥大化（1000枚×200KB = 200MB がWAL/vacuumに影響）、ストリーミング非対応、base64エンコードのオーバーヘッド
  - 適するケース: 画像が少なく（<100枚）かつ小さい（<50KB）場合のみ

#### 画像処理仕様

| 項目 | 値 | 備考 |
|---|---|---|
| 名刺物理サイズ | 91×55mm（日本規格） | 固定ターゲット |
| フルサイズ | 1200×750px | テキスト読み取り十分な解像度 |
| サムネイル | 300×188px | 一覧表示用 |
| フォーマット | **WebP** | JPEG比 25-35% 小さい、全ブラウザ対応 |
| 品質 | フル: 80、サムネ: 75 | 視覚品質とサイズのバランス |
| フルサイズ容量 | 60-150KB/枚 | スマホ写真3-8MBから大幅圧縮 |
| サムネイル容量 | 8-20KB/枚 | 一覧表示で高速 |
| 元画像保存 | **不要** | 名刺写真の再印刷需要なし |

#### 実装要件

- Python ライブラリ: **Pillow**（ImageMagick 不要）
- **EXIF 回転対応必須**: `ImageOps.exif_transpose(img)` — スマホ写真の回転メタデータ
- **HEIC（iPhone）**: `pillow-heif` 追加 or フロントで JPEG 変換
- NameCard モデルに `image_path: Mapped[str | None]` カラム追加

#### 画像前処理: 四隅選択 + 遠近補正（決定済み）

| 処理 | 実行場所 | 技術 |
|---|---|---|
| カメラガイド枠 | **フロントエンド** | 撮影画面に名刺サイズの枠を表示（撮影補助） |
| 四隅選択 UI | **フロントエンド** | **SVG overlay** でユーザーが名刺の四隅を手動選択 |
| 遠近補正 | **バックエンド** | OpenCV (`cv2.getPerspectiveTransform` + `cv2.warpPerspective`) |
| OCR | **バックエンド** | Gemini 2.5 Flash |

**処理フロー:**
1. ユーザーがカメラで撮影（**カメラガイド枠**で名刺位置を誘導）
2. フロントエンドで四隅選択 UI を表示（**SVG overlay** でユーザーが名刺の四隅をタップ/クリック）
3. 四隅座標 + 画像をバックエンドに送信
4. バックエンドで以下を**並行処理**:
   - **OCR**: Gemini 2.5 Flash に元画像を送信し構造化データを取得
   - **遠近補正**: OpenCV で四隅座標に基づき補正 → Pillow で WebP 変換・リサイズ → ローカル保存
5. 両方の結果をフロントエンドに返す

#### 🎯 決定事項

**ローカルファイルシステム（Docker Named Volume）+ Pillow で WebP 変換**

理由:
1. 個人用・単一サーバーで外部依存不要
2. 既に PostgreSQL で Named Volume パターンを使用中
3. 将来 R2 へ移行する場合も、DB にパスを保存しているため移行容易

---

### 3. 検索・フィルタリング

日本語を含む名刺データの検索方法。

#### 選択肢比較

| 選択肢 | 日本語対応 | 部分一致 | あいまい検索 | 導入コスト | 運用コスト |
|---|---|---|---|---|---|
| **単純 LIKE（インデックスなし）** | ✅ | ✅ | ❌ | ゼロ | ゼロ |
| **pg_bigm（bi-gram GIN）** | ✅ 完全 | ✅ インデックス効く | △ `bigm_similarity()` | 低（拡張1つ） | ゼロ |
| **PGroonga（Groonga ベース）** | ✅ 最高 | ✅ | ✅ | 中（依存が多い） | REINDEX必要 |
| **pg_trgm（trigram）** | ❌ 非対応 | — | — | — | — |
| **Elasticsearch + Kuromoji** | ✅ 最高 | ✅ | ✅ | 高（別サービス） | 高（JVM 512MB+） |

> **注意**: `pg_trgm` は CJK 文字を non-alphanumeric として無視するため、**日本語検索には使えない**。

#### 各選択肢の詳細

- **単純 LIKE/ILIKE**
  - メリット: 拡張不要、正確な部分一致、実装最速
  - デメリット: インデックスが効かず毎回シーケンシャルスキャン
  - パフォーマンス: **<10,000件なら <10ms**（事実上問題なし）
  - 適するケース: MVP、初期リリース

- **pg_bigm** ⭐推奨
  - メリット: CJK 部分一致に最適化（bigram: `'田中太郎'` → `'田中','中太','太郎'`）、GIN インデックスでクラッシュセーフ、インデックスサイズがコンパクト
  - デメリット: `shared_preload_libraries` 設定が必要（PostgreSQL 再起動）、2文字未満のクエリはインデックス非対応
  - 導入: `CREATE EXTENSION pg_bigm;` + GIN インデックス作成
  - `bigm_similarity()` 関数で類似度スコアリング可能

- **PGroonga**
  - メリット: 最高品質の日本語検索、形態素解析可能、プレフィックス検索、スコアリング、スニペット
  - デメリット: **クラッシュセーフではない**（異常終了後に `REINDEX` 必要）、Groonga ライブラリ依存、インデックスサイズが pg_bigm の ~2.3倍
  - 適するケース: >100,000 件の大規模データ、高度な形態素解析が必要な場合

- **Elasticsearch + Kuromoji**
  - メリット: 最高の日本語形態素解析、ファジーマッチング、ファセット検索
  - デメリット: 別サービス運用、データ同期、JVM メモリ 512MB+、個人用には過剰
  - 適するケース: マルチユーザー SaaS、>100,000 件

#### 推奨インデックス設計（pg_bigm）

```sql
CREATE EXTENSION IF NOT EXISTS pg_bigm;

-- 名前検索（漢字・カナ）
CREATE INDEX idx_nc_last_name_bigm ON name_cards USING gin (last_name gin_bigm_ops);
CREATE INDEX idx_nc_first_name_bigm ON name_cards USING gin (first_name gin_bigm_ops);
CREATE INDEX idx_nc_last_name_kana_bigm ON name_cards USING gin (last_name_kana gin_bigm_ops);
CREATE INDEX idx_nc_first_name_kana_bigm ON name_cards USING gin (first_name_kana gin_bigm_ops);

-- ノート・出会い情報検索
CREATE INDEX idx_nc_notes_bigm ON name_cards USING gin (notes gin_bigm_ops);
CREATE INDEX idx_nc_met_notes_bigm ON name_cards USING gin (met_notes gin_bigm_ops);

-- 組織情報検索
CREATE INDEX idx_rel_name_bigm ON relationships USING gin (name gin_bigm_ops);

-- 連絡先検索
CREATE INDEX idx_cm_value_bigm ON contact_methods USING gin (value gin_bigm_ops);
```

#### 検索クエリパターン

```sql
SELECT DISTINCT nc.* FROM name_cards nc
LEFT JOIN name_card_relationships ncr ON nc.id = ncr.name_card_id
LEFT JOIN relationships r ON ncr.relationship_id = r.id
LEFT JOIN contact_methods cm ON nc.id = cm.name_card_id
WHERE nc.user_id = :uid
  AND (
    nc.last_name LIKE '%' || :q || '%'
    OR nc.first_name LIKE '%' || :q || '%'
    OR nc.last_name_kana LIKE '%' || :q || '%'
    OR nc.first_name_kana LIKE '%' || :q || '%'
    OR nc.met_notes LIKE '%' || :q || '%'
    OR nc.notes LIKE '%' || :q || '%'
    OR r.name LIKE '%' || :q || '%'
    OR cm.value LIKE '%' || :q || '%'
  )
ORDER BY bigm_similarity(nc.last_name, :q) DESC
LIMIT 20;
```

#### 読み（ふりがな）検索

既存の `*_kana` カラムがそのまま読み検索に使える。ユーザーが「たなか」と入力 → `last_name_kana LIKE '%たなか%'` でマッチ。追加のフォネティックエンジン不要。

ローマ字検索が必要なら、`*_romaji` カラムを追加し Python `pykakasi` でカナ→ローマ字変換を insert/update 時に実行。

#### 🎯 決定事項

**Phase 1 から pg_bigm を導入**

理由:
1. CJK 部分一致の最適解で、クラッシュセーフ（GIN ベース）
2. 導入コストが低い（拡張1つ + GIN インデックス）
3. PGroonga は高機能だが、クラッシュ非安全+依存の多さが個人用にはリスク
4. Elasticsearch は運用コストが見合わない

---

### 4. データモデル拡張

#### 概念の再定義（2026-02-28 改訂）

ユーザーの指摘に基づき、Relationship / Tag / 出会い情報の概念を再定義した。

| 概念 | 旧定義 | 新定義 |
|---|---|---|
| **Relationship** | 関係性カテゴリ（仕事 > 取引先 > A社） | **組織情報の階層構造**（建築士会/桑名支部/青年会長） |
| **Tag** | アドホック横断分類 | **フラット分類ラベル**（ゴルフ仲間、友人、取引先、重要） |
| **NameCard ↔ Relationship** | 1:N（`relationship_id` FK） | **M:N**（中間テーブル `name_card_relationships`。兼務対応） |
| **company_name / department / position** | NameCard の専用カラム | **不要** — Relationship の階層で表現 |
| **出会い情報** | P3 後回し | **P1 必須** — `met_notes`（フリー入力。`met_at`, `met_context` は不要） |

#### 4a. Relationship = 組織情報の階層構造

**Relationship は「仕事/プライベート」のような分類ではなく、組織の所属構造を表す。**

```
建築士会（ルート）           Jasca（ルート）
├── 桑名支部（中間）         └── 三重（中間）
│   └── 青年会長（リーフ）       └── 理事（リーフ）
└── 鈴鹿支部（中間）
    └── 部長（リーフ）
```

NameCard は Relationship のリーフノード（または任意のノード）に M:N で紐付く。

**兼務の例:** 田中太郎 → 建築士会/桑名支部/青年会長 AND Jasca/三重/理事

中間テーブル `name_card_relationships`:

| name_card_id | relationship_id | 解決パス |
|---|---|---|
| 1 (田中太郎) | 5 (青年会長) | 建築士会/桑名支部/青年会長 |
| 1 (田中太郎) | 8 (理事) | Jasca/三重/理事 |

#### 4b. company_name / department / position は NameCard に不要

Relationship の階層がこれらを内包する:
- `company_name` = ルートノードの `name`（例: "建築士会"）
- `department` = 中間ノードの `name`（例: "桑名支部"）
- `position` = リーフノードの `name`（例: "青年会長"）

名刺一覧で「所属」を表示するには、`get_ancestors()` で full_path を取得:
```
建築士会/桑名支部/青年会長
```

**vCard エクスポート時は Relationship の階層から ORG / TITLE を動的に構築する**（後述）。

#### 4c. Tag = フラット分類ラベル

Tag は構造を持たない横断的なラベル付け:
- ゴルフ仲間、友人、取引先、重要

旧設計で Relationship が担っていた「仕事」「プライベート」「友人」のような分類は Tag で扱う。

#### 4d. 出会い情報: met_notes のみ（決定済み）

名刺の出会いコンテキストを記録する。NameCard に以下を追加:

```python
met_notes: Mapped[str | None] = mapped_column(Text, comment="どこで出会ったか")
```

- `met_notes`: 「どこで出会ったか」をフリー入力するテキストフィールド
- `met_at`, `met_context` は**不要**（`met_notes` に自由記述で十分）

#### 4e. 複数電話/メール: `contact_methods` テーブル

旧 NameCard の `email`/`phone` カラムを廃止し、`contact_methods` テーブルに統合。

```python
class ContactMethod(Base):
    __tablename__ = "contact_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_card_id: Mapped[int] = mapped_column(ForeignKey("name_cards.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)   # "email", "phone", "fax", "mobile", "website", ...
    label: Mapped[str] = mapped_column(String(50), nullable=False)  # "仕事", "自宅", "携帯"
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    is_primary: Mapped[bool] = mapped_column(default=False)
```

テーブルにする理由:
- 「この電話番号の持ち主は？」クエリが可能
- vCard `TEL;TYPE=WORK:` に直接マッピング
- 一意性制約が設定可能
- website, fax, SNS 等も統一的に管理

#### 4f. 住所: `addresses` テーブル（Phase 2）

住所は Phase 2 で追加予定。vCard `ADR` にマッピング。

#### 4g. 履歴管理: v1 では不要

- `updated_at` タイムスタンプで最終更新を追跡
- 必要になったら `name_card_history` テーブルを後から追加

#### 🎯 推奨

**M:N Relationship + met_notes + contact_methods を Phase 1 で実装。company_name/department/position は NameCard から除外。**

---

### 5. エクスポート/インポート

他アプリとのデータ互換性。

#### vCard フィールドマッピング

vCard **3.0** を推奨（最大互換性: Android 2.1 エクスポート可、iCloud 3.0 期待、一部CRM 4.0 要求）。

| アプリ内データ | vCard プロパティ | 備考 |
|---|---|---|
| `last_name`, `first_name` | `N:LastName;FirstName;;;` | 構造化名前（必須） |
| 姓名結合 | `FN:FirstName LastName` | 表示名（**必須**: 全バージョンで省略不可） |
| `first_name_kana` | `X-PHONETIC-FIRST-NAME` | Apple 用。Google は `SORT-STRING` 優先 |
| `last_name_kana` | `X-PHONETIC-LAST-NAME` | Apple 用。**両方出力が安全** |
| `contact_methods` (type=email) | `EMAIL;TYPE=WORK:` | `label` → vCard `TYPE` パラメータ |
| `contact_methods` (type=phone) | `TEL;TYPE=WORK:` | `label` → vCard `TYPE` パラメータ |
| `contact_methods` (type=fax) | `TEL;TYPE=FAX:` | |
| `contact_methods` (type=website) | `URL:` | |
| Relationship full_path → ORG | `ORG:Root;Middle;...` | 階層を `;` 区切りで構築（リーフ=役職は除外） |
| Relationship リーフノード name | `TITLE:` | リーフノードが役職相当 |
| 住所 (Phase 2) | `ADR;TYPE=WORK:;;street;city;region;postal;country` | 7コンポーネント構造 |
| `notes` | `NOTE:` | |
| `met_notes` | `NOTE:` に追記 or `X-NAMECARD-MET-NOTES:` | 標準プロパティなし → NOTE に含めるか拡張 |
| `image_path` → 画像データ | `PHOTO;ENCODING=b;TYPE=WEBP:` | Base64 埋め込み |
| `tags` | `CATEGORIES:tag1,tag2` | vCard 標準 |
| Relationship full_path | `X-NAMECARD-RELATIONSHIP:建築士会/桑名支部/青年会長` | アプリ固有（複数可） |

**Relationship → ORG/TITLE の変換ロジック:**

例: Relationship パス = `建築士会/桑名支部/青年会長`
- `ORG:建築士会;桑名支部` — ルートから中間ノードまでを `;` 区切り
- `TITLE:青年会長` — リーフノードを役職として出力

兼務の場合（複数 Relationship）:
- `ORG` と `TITLE` は vCard 上で複数出力可能（vCard 4.0）
- vCard 3.0 では最初の Relationship のみを ORG/TITLE に出力し、残りは `X-NAMECARD-RELATIONSHIP` で保持

#### カナ/ふりがなの互換性に関する注意

| プラットフォーム | 対応プロパティ |
|---|---|
| Apple (iCloud/iOS) | `X-PHONETIC-FIRST-NAME`, `X-PHONETIC-LAST-NAME` |
| Google Contacts | `SORT-STRING`（インポート時のみ）、`X-PHONETIC-*` も認識 |
| Outlook | `X-PHONETIC-*` を認識 |

**エクスポート時は `X-PHONETIC-*` と `SORT-STRING` の両方を出力** して最大互換性を確保。

#### CSV フォーマット

Google Contacts CSV フォーマットを第一対応とする（最もメジャーなインポート元）。

#### 🎯 決定事項

**Phase 1: CSV エクスポート + CSV インポート。vCard エクスポートは将来対応。**

- **エクスポート**: CSV（Phase 1）、vCard 3.0（将来）
- **インポート**: CSV（Phase 1）

理由:
1. CSV は実装コストが低く、Google Contacts 等との互換性が高い
2. vCard は Relationship 階層→ORG/TITLE 変換ロジックが必要で、Phase 1 では過剰

---

### 6. セキュリティ・プライバシー

個人情報を扱うアプリとしてのセキュリティ設計。

#### 個人用アプリに適切なレベル

| レイヤー | 推奨 | 現状 | 工数 |
|---|---|---|---|
| **通信暗号化（TLS）** | HTTPS 必須 | リバースプロキシで対応予定 | 低 |
| **認証** | JWT + bcrypt | ✅ 実装済み | — |
| **DB 暗号化（保存時）** | ボリューム暗号化 or PostgreSQL TDE | ❌ 未設定 | 低（デプロイ設定） |
| **フィールドレベル暗号化** | ❌ **不要** | — | — |
| **バックアップ暗号化** | `pg_dump \| gpg` or 暗号化ストレージ | ❌ 未設定 | 低 |
| **シークレット管理** | `.env` からのみ読み込み | ✅ 対応済み | — |

#### フィールドレベル暗号化が不要な理由

- 検索・ソート・インデックスが全て機能しなくなる
- 実装・運用コストが大幅に増加
- DB アクセス制御 + TLS + ボリューム暗号化で個人用には十分
- Google Contacts, Apple Contacts もフィールドレベル暗号化は行っていない

#### 法的考慮事項

**個人情報保護法（APPI）**:
- **個人利用**: 5,000件未満の個人情報を扱う個人は「個人情報取扱事業者」に該当しない → フル準拠は不要
- **SaaS 化した場合**: 同意取得、利用目的明示、漏洩通知（PPC へ3-5日以内）、越境移転制限が必要

**GDPR（EU 居住者の連絡先を保存する場合）**:
- **家庭用免除**: 純粋に個人的な連絡先管理には GDPR は適用されない
- **Web サービスとして公開した場合**: データコントローラーとして規制対象

**実用的な対策（今すぐ）**:
- `secret_key` のデフォルト値 `"change-me-in-production"` を本番では必ず変更
- データエクスポート機能（アクセス権）
- データ削除機能（消去権）
- アクセスログ記録

#### 🎯 決定事項

**標準レベル: HTTPS + DB暗号化。フィールドレベル暗号化は不要。**

---

### 7. バックアップ

#### 🎯 決定事項

**Phase 2 以降で対応**

- `pg_dump` + 画像ディレクトリの `tar` による定期バックアップを Phase 2 以降で実装
- Phase 1 では手動バックアップで対応

---

### 8. フロントエンド技術スタック

#### 🎯 決定事項

**Next.js + shadcn/ui + SCSS（⚠️ Tailwind は絶対に使用しない）**

- **フレームワーク**: Next.js（React ベース、SSR/SSG 対応、ファイルベースルーティング）
- **UI コンポーネント**: **shadcn/ui** を使用（Radix UI ベースのコンポーネントライブラリ）
- **スタイリング**: **SCSS** を使用
- **🚫 Tailwind CSS は絶対に使用しない** — ユーティリティクラスではなく SCSS でスタイリングする
- **ダークモード**: 対応する（shadcn/ui のテーマ機能 + SCSS 変数で実装）
- `docker-compose.yml` で既にフロントエンドサービスとして定義済み

> **⚠️ 重要**: shadcn/ui は通常 Tailwind CSS と組み合わせて使用されるが、本プロジェクトでは **SCSS でスタイルをオーバーライド** する。Tailwind のインストール・設定は一切行わない。

---

### 9. デプロイ・インフラ

#### 🎯 決定事項

**デプロイ先: VPS（自前管理）**

- 自前の VPS にデプロイする
- Docker Compose でサービスを管理

---

### 10. CI/CD

#### 🎯 決定事項

**GitHub Actions（CI）を Phase 1 から導入**

- **リポジトリ**: パブリック
- **CI ツール**: GitHub Actions
- **導入時期**: Phase 1 から
- CI 上では **Docker コンテナ** を使用してテスト・ビルドを実行

---

### 11. Python バージョン

#### 🎯 決定事項

**Python 3.14**

- バージョン: 3.14 のまま維持
- CI では Docker コンテナを使用して Python 3.14 環境を再現

---

### 12. テスト戦略

#### 🎯 決定事項

**⚠️ テストファースト（必須）**

- **テストを先に完成させてから、テストが通るように実装を進める**
- テストコードの改変はユーザー確認が必須（勝手にテストを変更しない）
- pytest を使用（バックエンド）
- フロントエンドのテストフレームワークは Phase 1-FE 開始時に決定

> **重要**: 実装がテストに合わせるのであって、テストを実装に合わせてはならない。テストの変更が必要な場合は必ずユーザーに確認すること。

---

### 13. API 設計方針

#### 🎯 決定事項

**序盤にがちがちに設計**

- フロント・バック並列実装のため、API スキーマ（OpenAPI）を先に厳密に確定する
- Pydantic スキーマを先に定義し、フロントエンドはモック API で開発を開始する

---

### 14. エラーメッセージ

#### 🎯 決定事項

**ユーザー向けメッセージは日本語**

- API のエラーレスポンスでユーザーに見せるメッセージは日本語で記述する
- 内部ログやシステムメッセージは英語のまま

---

### 15. 国際化（i18n）

#### 🎯 決定事項

**日本語のみ**

- UI、エラーメッセージ、すべて日本語
- 国際化対応は行わない

---

### 16. 画像アップロード制限

#### 🎯 決定事項

**最大アップロードサイズ: 20MB**

- 名刺画像のアップロード上限は 20MB
- アップロード後は WebP に変換・リサイズされるため保存サイズは小さい（60-150KB/枚）

---

### 17. 名刺枚数制限

#### 🎯 決定事項

**ユーザーごとの名刺枚数: 制限なし**

- 個人用アプリのため、名刺の登録枚数に上限を設けない

---

## 推奨される機能優先順位

> **📋 詳細な Phase 構成計画（Done 条件・依存関係・工数）は [namecard_manager.md](./namecard_manager.md) を参照。**
> 以下は機能の優先順位概要のみ。Phase 1 はバックエンド（1-BE）とフロントエンド（1-FE）に分割し並行開発可能。

### Phase 1: MVP（最小実用製品）— 推定 3-4 週間（BE/FE 並行時）

| # | 機能 | 詳細 | 依存 |
|---|---|---|---|
| 1 | **NameCard モデル改訂** | M:N Relationship, met_notes, image_path 追加。email/phone/relationship_id/company_name 等削除 | なし |
| 2 | **name_card_relationships 中間テーブル** | NameCard ↔ Relationship の M:N | #1 |
| 3 | **contact_methods テーブル** | 複数 email/phone/fax/website 対応 | #1 |
| 4 | **名刺 CRUD API** | 一覧、作成、詳細、更新、削除（`namecards.py`） | #1-3 |
| 5 | **Relationship CRUD API** | 階層構造の CRUD（組織情報） | なし |
| 6 | **Tag CRUD API** | タグの CRUD + 名刺へのタグ付け | なし |
| 7 | **Pydantic スキーマ定義** | NameCard, Relationship, Tag, ContactMethod の Request/Response | #1-3 |
| 8 | **pg_bigm 導入 + 検索 API** | GIN インデックス作成、名前/カナ/Relationship/met_notes での検索 | #4 |
| 9 | **画像アップロード・処理** | Pillow WebP 変換、サムネイル生成、カメラガイド枠、四隅選択UI（SVG overlay）、OpenCV 遠近補正 | #4 |
| 10 | **OCR（Gemini 2.5 Flash）** | 名刺画像→構造化データ自動抽出、OCR と四隅選択の並行処理 | #9 |
| 11 | **CSV エクスポート/インポート** | CSV エクスポート + Google Contacts CSV インポート | #4 |

### Phase 2: 拡張機能 — 推定 1-2 週間

| # | 機能 | 詳細 | 依存 |
|---|---|---|---|
| 12 | **`addresses` テーブル** | 構造化日本語住所 | Phase 1 |
| 13 | **バックアップ自動化** | `pg_dump` + 画像 `tar` の定期実行 | Phase 1 |
| 14 | **重複検出** | 同一人物の名刺をマージ提案 | Phase 1 |

### Phase 3: 将来

| # | 機能 | 詳細 |
|---|---|---|
| 15 | **vCard 3.0 エクスポート** | 単体・一括エクスポート |
| 16 | ローマ字検索 | `pykakasi` + `*_romaji` カラム |
| 17 | 変更履歴 | `name_card_history` append-only ログ |
| 18 | SNS リンク | LinkedIn, X 等の連携 |

---

## 技術的推奨事項

### 即座に対応すべき事項

1. **空エンドポイントファイルに `router = APIRouter()` を追加**
   - `namecards.py`, `search.py`, `images.py` が空のため、`api.py` の import で `AttributeError` が発生しアプリが起動しない
   - 最低限 `router = APIRouter()` を各ファイルに追加

2. **`secret_key` のデフォルト値を本番で使わない仕組み**
   - `config.py` の `default="change-me-in-production"` → 本番環境で必ず環境変数で上書き
   - バリデーションで本番時にデフォルト値なら起動拒否する安全策を検討

3. **Alembic マイグレーション導入**
   - 現在マイグレーションツールが未導入（`Base.metadata.create_all()` のみ？）
   - スキーマ変更の追跡・適用に Alembic が必須

### アーキテクチャ推奨

| 領域 | 推奨 | 理由 |
|---|---|---|
| OCR エンジン | Gemini 2.5 Flash（Phase 1） | 最高精度、構造化出力、無料枠充実 |
| 画像保存 | Docker Named Volume + Pillow WebP | 最もシンプル、外部依存なし |
| 四隅選択 UI | SVG overlay（フロント） | ユーザーが名刺の四隅を手動選択 |
| 遠近補正 | OpenCV（バックエンド） | `cv2.getPerspectiveTransform` + `cv2.warpPerspective` |
| カメラガイド枠 | フロントエンド | 撮影画面に名刺サイズの枠を表示 |
| 検索 | pg_bigm (GIN)（Phase 1） | CJK 最適化、クラッシュセーフ、低運用コスト |
| DB マイグレーション | Alembic | スキーマ変更の追跡・ロールバック |
| 画像フォーマット | WebP (quality 80) | JPEG 比 30% 小、全ブラウザ対応 |
| エクスポート | CSV（Phase 1）、vCard 3.0（将来） | CSV は最大互換性、vCard は将来対応 |
| インポート | CSV（Phase 1） | Google Contacts CSV フォーマット対応 |
| フロントエンド | Next.js + **shadcn/ui** + **SCSS**（⚠️ Tailwind 不使用） | React ベース、SSR/SSG 対応、ダークモード対応 |
| セキュリティ | HTTPS + DB暗号化（標準レベル） | 個人用アプリに十分 |
| バックアップ | Phase 2 以降 | `pg_dump` + 画像 `tar` |
| デプロイ | VPS（自前管理） | Docker Compose で管理 |
| CI/CD | GitHub Actions（Phase 1 から） | パブリックリポジトリ |
| Python | 3.14（CI は Docker コンテナ） | 最新バージョン維持 |
| テスト戦略 | ⚠️ テストファースト | テストを先に書き、実装をテストに合わせる |
| エラーメッセージ | 日本語（ユーザー向け） | 内部ログは英語 |
| 国際化 | 日本語のみ | i18n 不要 |
| 画像制限 | アップロード最大 20MB | 保存時は WebP 圧縮 |
| 名刺上限 | 制限なし | 個人用のため上限不要 |

### PostgreSQL 設定（Docker）

```yaml
# docker-compose.yml の db サービスに追加
command: >
  postgres
  -c shared_preload_libraries=pg_bigm
```

### パフォーマンス見積もり（<10,000 名刺）

| 操作 | LIKE (拡張なし) | pg_bigm (GIN) |
|---|---|---|
| 部分一致検索 | <10ms | <1ms |
| 一覧取得（ページネーション） | <5ms | <5ms |
| 画像配信（WebP, 100KB） | <1ms (ローカル) | — |

個人用アプリではどちらの選択肢でもパフォーマンス問題は発生しない。pg_bigm はスケーラビリティへの保険。

---

## 競合アプリ機能比較

| 機能 | Sansan | Eight | CamCard | Google Contacts | Apple Contacts | **本アプリ目標** |
|---|---|---|---|---|---|---|
| OCR スキャン | ✅ AI+人力 | ✅ AI | ✅ AI | ❌ | ❌ | **Phase 1** |
| 名前/会社/役職 | ✅ | ✅ | ✅ | ✅ | ✅ | **Phase 1** |
| 複数電話/メール | ✅ | ✅ | ✅ | ✅ | ✅ | **Phase 1** |
| カナ（ふりがな） | ✅ | ✅ | ❌ | ❌ | ✅ | **✅ 実装済み** |
| タグ/グループ | ✅ | ✅ | ✅ | ✅ | ✅ | **Phase 1** |
| 階層カテゴリ | ✅ (組織) | ❌ | ❌ | ❌ | ❌ | **✅ 実装済み（差別化要素）** |
| 名刺画像保存 | ✅ | ✅ | ✅ | ❌ | ❌ | **Phase 1** |
| CSV エクスポート/インポート | ✅ | ✅ | ✅ | ✅ | ❌ | **Phase 1** |
| vCard エクスポート | ❌ | ❌ | ✅ | ✅ | ✅ | Phase 3（将来） |
| CRM 連携 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ 不要 |
| チーム共有 | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ 不要 |
| 重複検出 | ✅ | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| 住所 | ✅ | ✅ | ✅ | ✅ | ✅ | Phase 2 |

**本アプリの差別化ポイント**:
- 階層的 Relationship で組織構造を表現（他の個人向けアプリにない）
- M:N で兼務対応
- Relationship + Tag の二軸分類（組織構造 × フラットラベル）
- カナ（ふりがな）対応
- 出会い情報の記録（met_notes）
- セルフホスト（プライバシー完全制御）
