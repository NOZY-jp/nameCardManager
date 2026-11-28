# 画像・OCR API（Phase 4）

Phase 3 までと同様、FastAPI と並行稼働する Next.js 側の Route Handlers。認可は `src/lib/auth/guard.ts`。

## エンドポイント（既存 FastAPI と同一パス・ステータス）

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/v1/images/upload` | multipart `file`。202 `{upload_id,message}` |
| POST | `/api/v1/images/process` | `{upload_id,corners[4]}`。OCR → 四隅補正 → WebP 保存 |
| POST | `/api/v1/images/process-additional` | 四隅補正 → WebP 保存（OCR なし） |
| GET | `/api/v1/images/namecard/{id}` | その名刺の全画像（`{images:[…]}`） |
| GET | `/api/v1/images/{id}` | position=0（`?image_id=` で指定可）を WebP で返す |
| GET | `/api/v1/images/{id}/thumbnail` | position=0 のサムネイル |
| POST | `/api/v1/namecards/{id}/images` | 画像レコード追加（201） |
| PUT/DELETE | `/api/v1/namecards/{id}/images/{imageId}` | 差し替え / 削除（削除後 position 再計算） |

- アップロードは JPEG / PNG / WebP、20MB まで。不正形式は 422。
- 未認証は 401、他ユーザーの名刺・画像は 404（存在を漏らさない）。

## 保存・変換

- `sharp` で 910×550 の四隅補正画像を作り、WebP（品質 85）とサムネイル（300×188 内、品質 80）を保存する。
- 保存先は `IMAGE_DIR`（既定 `./uploads/images`）。DB の `image_path` は FastAPI と同じく
  `IMAGE_DIR` 配下のパスを保存する（絶対なら絶対、相対なら相対）。
- 四隅補正は射影変換（dst→src の homography を解き、バイリニア補間でサンプリング）。OpenCV 非依存。
- サムネイルは `<IMAGE_DIR>/thumbnails/<name>.webp`。

## 既存 image_path の互換

`src/lib/images/paths.ts` の1箇所で解決する（読み取り専用）。次の候補を順に試す。

1. 指定パスそのもの（絶対）
2. `process.cwd()` からの相対
3. `IMAGE_DIR/<basename>`
4. `/uploads/...` を除いた `IMAGE_DIR` 配下
5. 拡張子が無ければ `.webp` を補う

サムネイルも同様に `thumbnails/` を見る。ファイルが無い場合は FastAPI と同じく白い WebP を返す。

## OCR（Vertex AI）

- `OCR_PROVIDER=vertex` のときだけ `@google/genai` で Vertex AI（既定 `gemini-3.1-flash-lite`）を呼ぶ。
  既定は `none`（外部を呼ばず空の結果）。
- 認証は `GOOGLE_APPLICATION_CREDENTIALS`（`secrets/vertex-sa.json`）。鍵・プロンプトはクライアントへ出さない。
- プロンプト・応答スキーマ・正規化は既存 `backend/app/services/ocr.py` を踏襲。`OCR_STRICT_FAILURE=true` のとき
  失敗を 503、既定（false）は空の結果を返す。
- 実 API を叩くテストはしない。単体テストは `extractBusinessCard` に `generate` を注入して検証し、E2E は
  `OCR_PROVIDER=none` で経路（アップロード→補正→保存→取得）を確認する。

### 実 API の手動確認（1回だけ・任意）

```bash
DATABASE_URL=... AUTH_SECRET=... SECRET_KEY=... \
OCR_PROVIDER=vertex VERTEX_PROJECT=... VERTEX_LOCATION=global \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/vertex-sa.json IMAGE_DIR=... pnpm dev
# ダミー画像で /api/v1/images/process を1回呼ぶ（概算 0.14 円/枚）
```

## テスト

```bash
cd frontend
pnpm exec vitest --run        # 互換パス・四隅補正・OCR正規化/モック
pnpm build

# E2E（隔離 PostgreSQL + IMAGE_DIR + OCR_PROVIDER=none）
DATABASE_URL=... AUTH_SECRET=... SECRET_KEY=... IMAGE_DIR=... OCR_PROVIDER=none \
  pnpm exec playwright test e2e/images-api.spec.ts
```
