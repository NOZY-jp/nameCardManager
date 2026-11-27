"""NDLOCR-Lite を HTTP で使うための小型サービス。

エンドポイント:
- GET  /health  – モデルの読み込み状態
- POST /ocr     – 画像 1 枚を受け取り、行単位のテキストを返す

このサービスは画像を保存しない・外部へ送らない。テキスト化だけを行い、
項目の切り出し（氏名・会社名など）は呼び出し側（バックエンド）の責務。
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app.engine import ImageDecodeError, NdlOcrEngine, OcrEngineError

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB（スマホの名刺写真は通常 2〜5MB）

engine = NdlOcrEngine()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """起動時にモデルを読み込む。

    読み込みに失敗してもプロセスは落とさない（health が 503 を返す）。
    落とすと Docker の再起動ループになり、原因がログに埋もれるため。
    """
    try:
        await run_in_threadpool(engine.load)
    except OcrEngineError:
        logger.exception("OCR モデルの読み込みに失敗しました")
    yield


app = FastAPI(title="namecard-ocr", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> JSONResponse:
    if not engine.loaded:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unavailable",
                "model_loaded": False,
                "error": engine.load_error,
            },
        )
    return JSONResponse(
        content={
            "status": "ok",
            "model_loaded": True,
            "ndlocr_version": engine.version,
        }
    )


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict[str, object]:
    if not engine.loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=engine.load_error or "OCR モデルがまだ読み込まれていません",
        )

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="画像が空です"
        )
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"画像が大きすぎます（上限 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB）",
        )

    filename = file.filename or "card.png"
    try:
        result = await run_in_threadpool(engine.recognize, data, filename)
    except ImageDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OcrEngineError as exc:
        logger.exception("OCR failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc

    return result
