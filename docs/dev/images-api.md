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

- アップロードは JPEG / PNG / WebP、**10MB まで**（アプリ側は固定値。環境変数では変えられない）。
  `Content-Length` と読み取り中の両方で上限を判定し、超過は 413。不正形式は 422。
- **現行の本番 nginx は `client_max_body_size` 未指定＝既定 1M** のため、10MB を通すには Phase 6 で
  `client_max_body_size 10M;` を `name_nozyjp` の server ブロックへ追加する（サーバー設定変更のため要承認）。
- 一時保持はプロセス内に TTL 30 分・最大 200 件・合計 200MB・ユーザーあたり 20 件。超過時は最古を追い出す。
- 未認証は 401、他ユーザーの名刺・画像は 404（存在を漏らさない）。

## 保存・変換

- `sharp` で 910×550 の四隅補正画像を作り、WebP（品質 85）とサムネイル（300×188 内、品質 80）を保存する。
- 保存先は `IMAGE_DIR`（既定 `./uploads/images`）。DB の `image_path` は FastAPI と同じく
  `IMAGE_DIR` 配下のパスを保存する（絶対なら絶対、相対なら相対）。
- 四隅補正は射影変換（dst→src の homography を解き、バイリニア補間でサンプリング）。OpenCV 非依存。
- サムネイルは `<IMAGE_DIR>/thumbnails/<name>.webp`。

## 既存 image_path の互換

`src/lib/images/paths.ts` の1箇所で解決する。**返すのは `IMAGE_DIR` の realpath 配下に実在するファイルだけ**
（セパレータ境界で判定。シンボリックリンクの脱出も拒否）。`..` を含むパスや外部絶対パスは実ファイルを
返さず、既存 FastAPI と同じく**白いプレースホルダ WebP を 200** で返す（内容は漏らさない）。

1. `IMAGE_DIR` 配下の絶対パス（そのまま）
2. `/uploads/...` / `uploads/images/...` / basename を `IMAGE_DIR` 基準へ写像
3. 拡張子が無ければ `.webp` を補う

サムネイルも同様に `thumbnails/` を見る。ファイルが無い場合は FastAPI と同じく白い WebP を返す。

**書き込み側**（画像追加・差し替え）は、`IMAGE_DIR` 配下に実在する自前形式のパスだけを許可する
（外部絶対パス・`..`・存在しないパスは 422）。DB に外部パスを入れさせない。

画像は `sharp` で再エンコードするため、EXIF / GPS などのメタデータは保存前に落ちる。

## OCR（Vertex AI）

- `OCR_PROVIDER=vertex` のときだけ `@google/genai` で Vertex AI（既定 `gemini-3.1-flash-lite`）を呼ぶ。
  **OCR 有効時の課金は外部（Google Cloud）の上限設定に依存する**（アプリ側のレート制限は未実装）。
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
