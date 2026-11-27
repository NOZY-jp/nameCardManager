# ocr-service — NDLOCR-Lite による名刺 OCR

日本語・縦書き対応の [NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite)（国立国会図書館製、CC BY 4.0）を CPU で動かし、HTTP で文字起こしだけを返すサービス。

- 画像はこのコンテナ内で処理し、保存も外部送信もしない。
- 料金は 0 円（API 課金なし）、1 枚あたり 0.3〜1 秒（モデル読み込み後）。
- 項目の切り出し（氏名・会社名・住所など）は **backend 側**（`backend/app/services/card_parser.py`）の辞書・正規表現が行う。LLM を使わないため、画像に無い文字列は生成されない。

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/health` | モデルの読み込み状態。未読込なら 503 |
| `POST` | `/ocr` | `multipart/form-data` の `file` に画像。行単位のテキストを返す |

```json
{
  "text": "株式会社サンプルテック\n営業部 課長\n山田 太郎",
  "markdown": "...",
  "lines": [
    {"text": "株式会社サンプルテック", "x": 120, "y": 80, "width": 640, "height": 48, "vertical": false, "confidence": 0.98}
  ],
  "width": 1050,
  "height": 600,
  "elapsed_ms": 640
}
```

`lines` は読み順（縦書きは右列から）。対応形式は JPEG / PNG / WebP / TIFF / BMP。長辺 2600px を超える画像は縮小する。

## 起動

```bash
# compose 経由（backend から http://ocr:8100 で到達）
docker compose up -d ocr
curl -s http://127.0.0.1:8100/health

# 単体ビルド
docker build -t namecard-ocr .
docker run --rm -p 127.0.0.1:8100:8100 namecard-ocr
```

## 実装メモ

- `ndlocr-lite` の CLI は 1 実行ごとにモデルを読み直すため、1 枚 7 秒かかる。このサービスは `ocr._run_ocr_on_image_array` を直接呼び、検出器と 3 つの認識器をプロセス内に保持する。**内部 API に依存するので `requirements.txt` でバージョンを固定している**（`SUPPORTED_VERSION` と一致しない場合は起動時に `/health` が 503 と理由を返す）。
- 推論はロックで直列化する（DEIM / PARSEQ のラッパーが内部状態を持つため）。名刺 1 枚が 1 秒未満なので同時実行 1 でも実用上問題ない。
- メモリは常駐約 0.7GB。`uvicorn --workers 1` で動かす（ワーカーを増やすとモデルがワーカー数だけ載る）。
- モデル（151MB）はビルド時に `XDG_CACHE_HOME=/app/.cache` へ取得する。起動時にネットワークは不要。

## ライセンス

NDLOCR-Lite は CC BY 4.0。アプリ内に「OCR: NDLOCR-Lite（国立国会図書館）」の出典表示が必要。
