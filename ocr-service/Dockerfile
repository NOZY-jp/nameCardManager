# NDLOCR-Lite（日本語・縦書き対応）を CPU で動かす OCR サービス。
# イメージサイズは約 1.5GB（onnxruntime + モデル 151MB）。
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    XDG_CACHE_HOME=/app/.cache

# opencv（ndlocr-lite 経由）が libGL / libglib を要求する
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

# モデル（151MB）をビルド時に取得しておき、起動を速く・ネットワーク非依存にする
RUN python - <<'PY'
import argparse
from pathlib import Path

import ocr
from model_download import MODELS, resolve_model_paths

base_dir = Path(ocr.__file__).resolve().parent
args = argparse.Namespace(**{option: None for option in MODELS})
resolve_model_paths(args, base_dir / "model")
PY

COPY app ./app

RUN useradd --create-home --uid 10001 ocruser \
    && chown -R ocruser:ocruser /app
USER ocruser

EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=20 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
