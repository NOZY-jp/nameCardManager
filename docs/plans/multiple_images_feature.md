# 名刺複数画像対応 設計計画書

## 概要

名刺（NameCard）に複数の画像を紐づけられるようにする仕様変更の設計計画。
`name_cards.image_path` カラムを廃止し、新規テーブル `name_card_images` で画像を管理する。
データベースは新規作成するため、データ移行は不要。

---

## 1. データベース設計

### 1-1. 新規テーブル: `name_card_images`

```sql
CREATE TABLE name_card_images (
    id            SERIAL PRIMARY KEY,
    name_card_id  INTEGER NOT NULL REFERENCES name_cards(id) ON DELETE CASCADE,
    image_path    VARCHAR(500) NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,   -- 表示順序（0始まり、小さい順）
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_name_card_images_name_card_id ON name_card_images(name_card_id);
```

| カラム | 型 | 説明 |
|---|---|---|
| `id` | SERIAL PK | 画像レコードID |
| `name_card_id` | INTEGER FK | 名刺ID（CASCADE DELETE） |
| `image_path` | VARCHAR(500) | WebP画像のファイルパス |
| `position` | INTEGER | 表示順序（0が最初=サムネイル対象） |
| `created_at` | TIMESTAMPTZ | 画像追加日時 |

**設計判断:**
- `position` カラムで順序管理。サムネイル表示は `position = 0`（最初に追加した画像）を使用
- サムネイルパスは `image_path` から導出（`{dir}/thumbnails/{filename}`）するため別カラム不要（既存の慣例を踏襲）
- `ON DELETE CASCADE` により名刺削除時に画像レコードも自動削除

### 1-2. SQLAlchemy モデル: `NameCardImage`

```python
class NameCardImage(Base):
    __tablename__ = "name_card_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_card_id: Mapped[int] = mapped_column(
        ForeignKey("name_cards.id", ondelete="CASCADE"), nullable=False
    )
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # リレーション
    name_card: Mapped[NameCard] = _relationship(back_populates="images")
```

### 1-3. NameCard モデルへのリレーション追加

```python
class NameCard(Base):
    # ... 既存フィールド ...

    # 新規: 画像リレーション（position順でソート）
    images: Mapped[list[NameCardImage]] = _relationship(
        back_populates="name_card",
        cascade="all, delete-orphan",
        order_by="NameCardImage.position",
    )
```

### 1-4. `name_cards.image_path` カラムの廃止

**方針: カラム削除**

データベースは新規作成するため、`name_cards.image_path` カラムを削除する。
画像は全て `name_card_images` テーブルで管理する。

```python
# NameCard モデルから image_path フィールドを削除
class NameCard(Base):
    # image_path フィールドは存在しない
    # 画像は images リレーションで管理
    pass
```

### 1-5. マイグレーションファイル

```
backend/alembic/versions/xxxx_add_name_card_images_table.py
```

**内容:**
1. `name_card_images` テーブルを新規作成
2. `name_cards` テーブルから `image_path` カラムを削除

---

## 2. バックエンドAPI設計

### 2-1. 新規エンドポイント

#### `POST /images/process-additional`
追加画像専用。OCRを実行せず、遠近補正+WebP保存のみ。

```python
@router.post("/process-additional")
def process_additional_image(
    body: ProcessRequest,
    current_user: AuthUser,
) -> dict[str, str]:
    """追加画像の遠近補正 + WebP保存（OCR なし）。"""
    # upload_id から画像取得
    # 遠近補正
    # WebP保存
    # return {"image_path": ..., "thumbnail_path": ...}
```

**レスポンス:**
```json
{
  "image_path": "/uploads/images/xxxx.webp",
  "thumbnail_path": "/uploads/images/thumbnails/xxxx.webp"
}
```

#### `POST /namecards/{id}/images`
名刺に画像を追加する。

```python
@router.post("/{nc_id}/images", status_code=201)
def add_image(nc_id: int, body: AddImageRequest, current_user: AuthUser, db: DbSession):
    """名刺に画像を追加する。"""
    # position は自動計算（現在の最大position + 1）
```

**リクエスト:**
```json
{ "image_path": "/uploads/images/xxxx.webp" }
```

#### `DELETE /namecards/{id}/images/{image_id}`
名刺から画像を削除する。

```python
@router.delete("/{nc_id}/images/{image_id}", status_code=204)
def delete_image(nc_id: int, image_id: int, current_user: AuthUser, db: DbSession):
    """名刺から画像を削除する。削除後にpositionを再計算。"""
```

#### `PUT /namecards/{id}/images/{image_id}`
画像を差し替える（変更）。

```python
@router.put("/{nc_id}/images/{image_id}")
def replace_image(nc_id: int, image_id: int, body: ReplaceImageRequest, current_user: AuthUser, db: DbSession):
    """既存画像を新しい画像で差し替える。positionは維持。"""
```

**リクエスト:**
```json
{ "image_path": "/uploads/images/new_xxxx.webp" }
```

#### `GET /images/namecard/{namecard_id}`
名刺の全画像一覧を取得する。

```python
@router.get("/namecard/{namecard_id}")
def get_namecard_images(namecard_id: int, current_user: AuthUser, db: DbSession):
    """名刺に紐づく全画像のリストを返す（position順）。"""
```

**レスポンス:**
```json
{
  "images": [
    { "id": 1, "image_path": "...", "position": 0, "created_at": "..." },
    { "id": 2, "image_path": "...", "position": 1, "created_at": "..." }
  ]
}
```

### 2-2. 既存エンドポイントの修正

#### `GET /images/{namecard_id}` → 最初の画像を返す
`name_card_images` テーブルから `position=0` の画像を返す。

#### `GET /images/{namecard_id}/thumbnail` → 最初の画像のサムネイルを返す
同上。

#### `POST /images/process` → 変更なし
既存のOCR付き処理はそのまま。新規作成フロー（最初の1枚）で引き続き使用。

#### `POST /namecards` (create)
- `image_path` は受け付けず、`image_paths` 配列で画像を受け取る
- 最初の画像を `position=0` として `name_card_images` に挿入
- レスポンスに `images` 配列を含める

#### `PATCH /namecards/{id}` (update)
- 画像の操作は個別の画像API（追加/削除/差し替え）で行う
- レスポンスに `images` 配列を含める

#### `GET /namecards/{id}` / `GET /namecards` (list)
- レスポンスに `images` 配列を含める

### 2-3. 新規スキーマ（Pydantic）

```python
# schemas/__init__.py に追加

class NameCardImageResponse(BaseModel):
    """名刺画像レスポンス。"""
    id: int
    image_path: str
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}

class AddImageRequest(BaseModel):
    """画像追加リクエスト。"""
    image_path: str

class ReplaceImageRequest(BaseModel):
    """画像差し替えリクエスト。"""
    image_path: str

class ProcessAdditionalResponse(BaseModel):
    """追加画像処理レスポンス（OCRなし）。"""
    image_path: str
    thumbnail_path: str
```

**NameCardResponse の変更:**
```python
class NameCardResponse(BaseModel):
    # ... 既存フィールド（image_path は削除） ...
    images: list[NameCardImageResponse]  # 新規
```

---

## 3. フロントエンド設計

### 3-1. 新規コンポーネント

#### `ImageActionMenu`
画像操作のプルダウンメニューコンポーネント。

```
frontend/src/components/namecard/ImageActionMenu.tsx
frontend/src/components/namecard/ImageActionMenu.module.scss
```

**Props:**
```typescript
interface ImageActionMenuProps {
  mode: "change" | "add";           // 変更 or 追加
  onSelectImage: () => void;        // 画像を選択
  onCapturePhoto: () => void;       // 写真を撮影
}
```

**UI仕様:**
- `mode="change"`: 「画像を変更」アイコンボタン → プルダウン
  - 画像を選択して変更
  - 写真を撮影して変更
- `mode="add"`: 「画像を追加」アイコンボタン → プルダウン
  - 画像を選択して追加
  - 写真を撮影して追加

#### `ImageGallery`
名刺詳細画面で複数画像を縦に並べて表示するコンポーネント。

```
frontend/src/components/namecard/ImageGallery.tsx
frontend/src/components/namecard/ImageGallery.module.scss
```

**Props:**
```typescript
interface ImageGalleryProps {
  namecardId: string;
  images: NameCardImageData[];
}
```

#### `AdditionalImageFlow`
追加画像用のフロー（OCRなし、四隅選択+台形補正のみ）。

```
frontend/src/components/camera/AdditionalImageFlow.tsx
frontend/src/components/camera/AdditionalImageFlow.module.scss
```

**Props:**
```typescript
interface AdditionalImageFlowProps {
  source: "file" | "camera";
  onComplete: (imagePath: string) => void;
  onCancel: () => void;
}
```

**フロー:**
1. ファイル選択 or カメラ撮影
2. 四隅選択（CornerSelector 再利用）
3. `POST /images/upload` → `POST /images/process-additional` （OCRスキップ）
4. 遠近補正後の `image_path` を `onComplete` で返す

### 3-2. 既存コンポーネントの修正

#### `NameCardForm.tsx`
- hidden input `image_path` → `images` 配列管理に変更
- 画像プレビューセクション追加:
  - 各画像に「変更」ボタン（ImageActionMenu mode="change"）
  - 「画像を追加」ボタン（ImageActionMenu mode="add"）
  - 各画像に「削除」ボタン
- 画像追加/変更時は `AdditionalImageFlow` を起動

#### `NameCardDetail.tsx`
- 現在の単一画像表示 → `ImageGallery` コンポーネントに置換
- `card.images` 配列を使用して複数画像を縦に並べて表示

#### `NameCardItem.tsx`（一覧サムネイル）
- 変更最小限: `card.image_path` → `card.images?.[0]?.image_path` に変更
- API `/images/{namecard_id}/thumbnail` は最初の画像のサムネイルを返すため、API呼び出し自体は変更不要

#### `NameCardEditDialog.tsx`
- `NameCardForm` に `images` データを渡すように修正

#### `CameraOCRFlow.tsx` / `ImageUploadOCR.tsx`
- 新規作成の最初の1枚は現行フローのまま（OCR付き）
- 変更不要（既存フローは維持）

### 3-3. TypeScript 型定義の変更

```typescript
// lib/api/namecards.ts

// 新規
export interface NameCardImageData {
  id: number;
  image_path: string;
  position: number;
  created_at: string;
}

// NameCard インターフェースに追加
export interface NameCard {
  // ... 既存フィールド ...
  images: NameCardImageData[];  // 新規
}
```

```typescript
// lib/api/images.ts に追加

export interface ProcessAdditionalResponse {
  image_path: string;
  thumbnail_path: string;
}

export const imageApi = {
  // ... 既存 ...

  async processAdditional(params: ProcessImageRequest): Promise<ProcessAdditionalResponse> {
    const response = await apiClient.post<ProcessAdditionalResponse>(
      "/images/process-additional",
      { upload_id: params.upload_id, corners: params.corners },
    );
    return response.data;
  },
};
```

```typescript
// lib/api/namecards.ts に追加

export async function addNameCardImage(
  namecardId: string | number,
  imagePath: string,
): Promise<NameCardImageData> { ... }

export async function deleteNameCardImage(
  namecardId: string | number,
  imageId: number,
): Promise<void> { ... }

export async function replaceNameCardImage(
  namecardId: string | number,
  imageId: number,
  newImagePath: string,
): Promise<NameCardImageData> { ... }
```

### 3-4. Zod スキーマの変更

```typescript
// lib/schemas/namecard.ts

export const namecardCreateSchema = z.object({
  // ... 既存フィールド（image_path は削除） ...
  image_paths: z.array(z.string()).optional(), // 複数画像
});
```

### 3-5. 状態管理フロー

#### 新規作成フロー
```
1. モード選択（画像/カメラ/手入力）
2. 最初の1枚: 既存フロー（OCR付き） → image_path 取得
3. フォーム表示（OCR結果反映済み）
4. 「画像を追加」ボタン → ImageActionMenu プルダウン
   → 画像選択 or カメラ撮影
   → 四隅選択（CornerSelector）
   → process-additional API（OCRなし）
   → image_path を images 配列に追加
5. 登録時: 全 image_paths を NameCardCreate に含めて送信
```

#### 編集フロー
```
1. 既存の images を表示
2. 各画像に「変更」ボタン → ImageActionMenu
   → 新しい画像で差し替え（replace API）
3. 「画像を追加」ボタン → ImageActionMenu
   → 新しい画像を追加（add API）
4. 「削除」ボタン → 画像を削除（delete API）
```

### 3-6. UI表示仕様

#### 名刺一覧（NameCardItem）
- サムネイル: **最初に追加した1枚のみ**（`images[0]` = `position=0`）
- 変更なし（既存APIが `position=0` の画像を返す）

#### 名刺詳細（NameCardDetail）
- **複数の画像が縦に並ぶ**
- 各画像: `AuthImage` で表示
- 新規 `GET /images/namecard/{id}/{image_id}` エンドポイント or 既存 `GET /images/{image_id}` をimage_id基準に変更

---

## 4. 修正対象ファイル一覧

### 4-1. バックエンド

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `backend/app/models/__init__.py` | **修正** | `NameCardImage` モデル追加、`NameCard` にリレーション追加 |
| `backend/app/schemas/__init__.py` | **修正** | `NameCardImageResponse`, `AddImageRequest`, `ReplaceImageRequest`, `ProcessAdditionalResponse` 追加。`NameCardResponse` に `images` 追加 |
| `backend/app/api/v1/endpoints/images.py` | **修正** | `process-additional` エンドポイント追加。既存 `get_image`/`get_thumbnail` を `name_card_images` テーブル参照に変更。`GET /images/namecard/{id}` 追加 |
| `backend/app/api/v1/endpoints/namecards.py` | **修正** | `_build_namecard_response` に `images` 追加。`create`/`update` で `name_card_images` を操作。`POST/DELETE/PUT /{id}/images` エンドポイント追加 |
| `backend/alembic/versions/xxxx_add_name_card_images.py` | **新規** | マイグレーション（テーブル作成 + `image_path` カラム削除） |

### 4-2. フロントエンド

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `frontend/src/lib/api/images.ts` | **修正** | `processAdditional` API関数追加 |
| `frontend/src/lib/api/namecards.ts` | **修正** | `NameCardImageData` 型追加、`NameCard` 型に `images` 追加、画像追加/削除/差し替えAPI関数追加 |
| `frontend/src/lib/schemas/namecard.ts` | **修正** | `image_paths` フィールド追加 |
| `frontend/src/components/namecard/ImageActionMenu.tsx` | **新規** | 画像変更/追加プルダウンメニュー |
| `frontend/src/components/namecard/ImageActionMenu.module.scss` | **新規** | スタイル |
| `frontend/src/components/namecard/ImageGallery.tsx` | **新規** | 複数画像縦並び表示 |
| `frontend/src/components/namecard/ImageGallery.module.scss` | **新規** | スタイル |
| `frontend/src/components/camera/AdditionalImageFlow.tsx` | **新規** | 追加画像フロー（OCRなし） |
| `frontend/src/components/camera/AdditionalImageFlow.module.scss` | **新規** | スタイル |
| `frontend/src/components/namecard/NameCardForm.tsx` | **修正** | 画像管理UI追加（プレビュー、変更/追加/削除ボタン） |
| `frontend/src/components/namecard/NameCardForm.module.scss` | **修正** | 画像セクションのスタイル追加 |
| `frontend/src/components/namecard/NameCardDetail.tsx` | **修正** | 単一画像 → ImageGallery に置換 |
| `frontend/src/components/namecard/NameCardDetail.module.scss` | **修正** | 画像ギャラリーのスタイル調整 |
| `frontend/src/components/namecard/NameCardItem.tsx` | **修正** | `image_path` 参照を `images[0]` ベースに変更（軽微） |
| `frontend/src/components/namecard/NameCardEditDialog.tsx` | **修正** | `images` データをフォームに渡す |
| `frontend/src/components/namecard/index.ts` | **修正** | 新規コンポーネントのexport追加 |
| `frontend/src/components/camera/index.ts` | **修正** | `AdditionalImageFlow` のexport追加 |
| `frontend/src/app/(main)/namecards/new/page.tsx` | **修正** | 追加画像フローの統合 |
| `frontend/src/app/(main)/namecards/[id]/page.tsx` | **修正** | 画像管理ロジック追加（軽微） |

---

## 5. 工数見積もり

| フェーズ | タスク | 工数 |
|---|---|---|
| **Step 1: DB + モデル** | NameCardImage モデル、マイグレーション（テーブル作成 + カラム削除） | 1.5h |
| **Step 2: バックエンドAPI** | 新規エンドポイント4つ + 既存修正 | 4h |
| **Step 3: バックエンドテスト** | 新規APIのユニットテスト | 2h |
| **Step 4: フロントエンド型定義+API** | TypeScript型、API関数、Zodスキーマ | 1h |
| **Step 5: AdditionalImageFlow** | OCRなし画像処理フロー | 3h |
| **Step 6: ImageActionMenu** | プルダウンメニューUI | 1.5h |
| **Step 7: ImageGallery** | 複数画像表示コンポーネント | 1.5h |
| **Step 8: NameCardForm 修正** | 画像管理UI統合 | 3h |
| **Step 9: NameCardDetail 修正** | 詳細画面の複数画像対応 | 1h |
| **Step 10: 結合テスト + 修正** | E2Eテスト、バグ修正 | 3h |
| **合計** | | **約 22h（Medium規模）** |

---

## 6. 実装順序

### Step 1: データベース層（バックエンド）
1. `NameCardImage` モデルを `backend/app/models/__init__.py` に追加
2. `NameCard` モデルに `images` リレーションを追加し、`image_path` フィールドを削除
3. Alembic マイグレーション作成・実行（`name_card_images` テーブル作成 + `name_cards.image_path` カラム削除）

### Step 2: スキーマ + API基盤（バックエンド）
1. Pydantic スキーマに `NameCardImageResponse` 等を追加
2. `NameCardResponse` に `images` フィールド追加
3. `_build_namecard_response` ヘルパー修正
4. 既存の `GET /images/{namecard_id}` と `GET /images/{namecard_id}/thumbnail` を `name_card_images` テーブル参照に変更

### Step 3: 新規APIエンドポイント（バックエンド）
1. `POST /images/process-additional`（OCRなし遠近補正）
2. `POST /namecards/{id}/images`（画像追加）
3. `DELETE /namecards/{id}/images/{image_id}`（画像削除）
4. `PUT /namecards/{id}/images/{image_id}`（画像差し替え）
5. `GET /images/namecard/{namecard_id}`（画像一覧）

### Step 4: バックエンドテスト
1. 新規エンドポイントのテスト
2. 既存テストの修正（レスポンスに `images` が追加されるため）
3. マイグレーションテスト

### Step 5: フロントエンド型定義 + API関数
1. `NameCardImageData` 型追加
2. `NameCard` 型に `images` 追加
3. `imageApi.processAdditional` 追加
4. `addNameCardImage`, `deleteNameCardImage`, `replaceNameCardImage` 追加

### Step 6: AdditionalImageFlow コンポーネント
1. ファイル選択 or カメラ撮影 → 四隅選択 → process-additional API
2. `CornerSelector` 再利用
3. OCRは実行しない

### Step 7: ImageActionMenu + ImageGallery コンポーネント
1. プルダウンメニュー（変更/追加 × 画像選択/撮影）
2. 複数画像縦並び表示

### Step 8: 既存コンポーネント修正
1. `NameCardForm` に画像管理UI統合
2. `NameCardDetail` を `ImageGallery` に置換
3. `NameCardItem` のサムネイル参照修正（軽微）
4. `NameCardEditDialog` の images データ受け渡し

### Step 9: ページ統合
1. `namecards/new/page.tsx` で追加画像フロー統合
2. `namecards/[id]/page.tsx` で画像管理ロジック追加

### Step 10: テスト + 仕上げ
1. E2Eテスト追加（複数画像の追加・変更・削除）
2. 既存テストの修正
3. バグ修正・UIポリッシュ

---

## 7. 設計上の注意点

### 7-1. `image_path` の完全廃止
- `name_cards` テーブルから `image_path` カラムを削除する
- `NameCardResponse` から `image_path` フィールドを削除する
- 既存の `GET /images/{namecard_id}` / `GET /images/{namecard_id}/thumbnail` は `name_card_images` テーブルの `position=0` の画像を返す
- Import/Export 機能（`backend/app/api/v1/endpoints/export.py`, `import_.py`）は `images` 配列を使用するように変更する

### 7-2. 画像処理フロー
- **最初の1枚**（新規作成時）: 既存フロー（OCR + 遠近補正）
- **追加画像**: OCRなし、四隅選択+遠近補正のみ（`process-additional` エンドポイント）
- **画像変更**: 既存画像の `image_path` を新しいパスに差し替え

### 7-3. ファイル管理
- 画像の物理削除は画像レコード削除時に実施（オプション: 初期実装ではDBレコードのみ削除、ファイルは残す）
- サムネイルは `image_path` から `{dir}/thumbnails/{filename}` で導出（既存パターン踏襲）

### 7-4. Tailwind CSS 禁止
- 全スタイルは SCSS Modules で実装（既存プロジェクトの慣例に従う）

### 7-5. 国際化
- 日本語のみ対応（既存と同様）

---

## 8. リスク・考慮事項

| リスク | 影響 | 対策 |
|---|---|---|
| 既存テストの大量修正 | レスポンス構造の変更（`image_path` 廃止、`images` 配列追加）により既存テストが壊れる | Step 4 で網羅的に修正 |
| 画像ファイルの蓄積 | ディスク使用量増加 | 画像差し替え時の古いファイル削除、または定期クリーンアップジョブを検討 |
| 編集画面の複雑化 | 画像管理UIの追加によりフォームが複雑になる | ImageActionMenu をコンパクトなアイコンベースに。画像操作は個別API呼び出し（フォーム送信と分離） |
