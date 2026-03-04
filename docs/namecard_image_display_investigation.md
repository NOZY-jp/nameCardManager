# 名刺画像が表示されない問題 — 調査レポート

## 調査日: 2026-03-04

---

## 1. 問題の説明

名刺を画像アップロード or カメラ撮影 → 四隅選択 → OCR → フォーム入力 → 登録 のフローで作成しても、以下の状態になっている:

- DB の `name_cards.image_path` が **全レコードで空** (`NULL` or `''`)
- 名刺一覧ページでサムネイル画像が表示されない（プレースホルダーアイコンのみ）
- 名刺詳細ページで名刺画像が表示されない

---

## 2. 原因

### 原因1: フロントエンドが `image_path` を名刺作成APIに送信していない（**根本原因**）

**発生箇所**: `ImageUploadOCR.tsx` (L120-169), `CameraOCRFlow.tsx` (L97-147), `new/page.tsx` (L55-76)

**詳細**:

1. `/api/v1/images/process` APIは `image_path` と `thumbnail_path` を正しく返している:
   ```json
   {
     "ocr_result": { ... },
     "image_path": "uploads/images/xxxx.webp",
     "thumbnail_path": "uploads/images/thumbnails/xxxx.webp"
   }
   ```

2. しかし `ImageUploadOCR.tsx` の `handleCornersConfirm` (L120) で:
   ```typescript
   const { ocr_result } = await ocrPromise;  // ← image_path を破棄している！
   ```
   **`image_path` と `thumbnail_path` はデストラクチャリングで捨てられている。**

3. `onComplete(formData)` で渡される `formData` には OCR テキスト結果のみが含まれ、`image_path` は含まれない。

4. 同じ問題が `CameraOCRFlow.tsx` (L110) にも存在する。

**データフローの断絶ポイント**:
```
images/process API → { ocr_result, image_path, thumbnail_path }
                              ↓                    ↓ (破棄)
                     formDataに変換          image_path が消失
                              ↓
                     NameCardForm に渡す
                              ↓
                     POST /namecards → image_path=null
```

### 原因2: フロントエンドのZodスキーマとフォームに `image_path` フィールドがない

**発生箇所**: `frontend/src/lib/schemas/namecard.ts`, `NameCardForm.tsx`

- `namecardCreateSchema` に `image_path` フィールドが定義されていない
- `NamecardCreateFormData` 型に `image_path` が含まれない
- `NameCardForm.tsx` のフォーム初期値設定で `image_path` を扱っていない
- `NameCardCreateData` API型には `image_path` が含まれていない（`namecards.ts` L48-61）

これにより、たとえ `image_path` をOCR結果と一緒に渡しても、Zodバリデーションで除外される。

### 原因3: 画像表示UIは存在するが `image_path` の値が空のため表示されない

**発生箇所**: `NameCardItem.tsx` (L28, L45-54), `NameCardDetail.tsx` (L29, L67-76)

- `NameCardItem.tsx` L28: `const imageSrc = card.image_path || card.image_front_url || null;`
- `NameCardDetail.tsx` L29: `const imageSrc = card.image_front_url || card.image_path || null;`

UIコードは存在するが、`image_path` が常に `null` のため条件分岐で画像セクションがスキップされる。

**補足**: `image_front_url` はDBモデルに存在しないフィールドで、APIレスポンスにも含まれない。おそらく旧設計の名残り。

### 原因4（潜在的）: `image_path` がファイルシステムのパスで、フロントエンドから直接アクセスできない

**発生箇所**: `backend/app/api/v1/endpoints/images.py` (L334-347)

- `/images/process` が返す `image_path` は `"uploads/images/xxxx.webp"` というサーバー内部のファイルパス
- フロントエンドの `<Image src={imageSrc}>` でこのパスを直接使うと 404 になる
- 正しくは `GET /api/v1/images/{namecard_id}` API経由で画像を取得すべき
- このAPIは正しく実装されている（`images.py` L351-392）が、フロントエンドから呼ばれていない

---

## 3. 修正案

### 修正A: `image_path` をフローに通す（必須）

1. **`ImageUploadOCR.tsx`** と **`CameraOCRFlow.tsx`**:
   - `processImage` APIレスポンスから `image_path` を取得
   - `onComplete` コールバックの型を拡張して `image_path` を含める

2. **`namecardCreateSchema`** (`frontend/src/lib/schemas/namecard.ts`):
   - `image_path: z.string().optional()` を追加

3. **`NameCardCreateData`** (`frontend/src/lib/api/namecards.ts`):
   - `image_path?: string` を追加

4. **`new/page.tsx`**:
   - `handleOCRComplete` で受け取った `image_path` をフォームデータに含める

5. **`NameCardForm.tsx`**:
   - `defaultValues` から `image_path` を受け取り、hidden フィールドとしてフォームに含める

### 修正B: 画像表示を API 経由に変更（推奨）

1. **`NameCardItem.tsx`** と **`NameCardDetail.tsx`**:
   - `image_path` の生パスではなく `/api/v1/images/{card.id}` を画像URLとして使用
   - `image_path` が存在する場合のみ画像表示

   ```tsx
   // Before
   const imageSrc = card.image_path || card.image_front_url || null;
   
   // After
   const imageSrc = card.image_path ? `/api/v1/images/${card.id}` : null;
   ```

2. サムネイル用には `/api/v1/images/{card.id}/thumbnail` を使用

### 修正C: `image_front_url` 参照を削除（整理）

- `NameCardItem.tsx` L28 と `NameCardDetail.tsx` L29 から `image_front_url` の参照を削除
- `NameCard` 型から `image_front_url`, `image_back_url` を削除（旧設計の名残り）

---

## 4. 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/camera/ImageUploadOCR.tsx` | `image_path` を `onComplete` に含める |
| `frontend/src/components/camera/CameraOCRFlow.tsx` | 同上 |
| `frontend/src/lib/schemas/namecard.ts` | `image_path` フィールド追加 |
| `frontend/src/lib/api/namecards.ts` | `NameCardCreateData` に `image_path` 追加 |
| `frontend/src/app/(main)/namecards/new/page.tsx` | OCR結果から `image_path` をフォームに渡す |
| `frontend/src/components/namecard/NameCardForm.tsx` | `image_path` をhiddenフィールドとして管理 |
| `frontend/src/components/namecard/NameCardItem.tsx` | 画像URL を API 経由に変更 |
| `frontend/src/components/namecard/NameCardDetail.tsx` | 画像URL を API 経由に変更 |

---

## 5. 検証結果のエビデンス

### DB確認
```sql
SELECT id, image_path FROM name_cards WHERE image_path IS NOT NULL AND image_path != '';
-- → 0 rows（全レコードで image_path が空）
```

### API確認
```bash
# /images/process は image_path を正しく返す
POST /api/v1/images/process → { "image_path": "uploads/images/xxxx.webp", ... }

# しかし POST /namecards には image_path が送信されていない
```

### ファイルシステム確認
```
uploads/images/ に WebP ファイルは存在する（処理済み画像は保存されている）
uploads/images/thumbnails/ にサムネイルも存在する
```
