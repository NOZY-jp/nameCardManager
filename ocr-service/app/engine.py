"""NDLOCR-Lite を常駐プロセスで使うためのラッパー。

`ndlocr-lite` の CLI は 1 実行ごとにモデルを読み直すため、1 枚あたり約 7 秒かかる。
このモジュールは検出器と 3 つの認識器をプロセス内に保持し、2 枚目以降を
0.3〜1 秒で処理する。

ndlocr-lite 2.0.0 の内部関数 ``ocr._run_ocr_on_image_array`` を呼ぶ。
内部関数に依存するため、requirements.txt でバージョンを固定している。
"""

from __future__ import annotations

import argparse
import io
import logging
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# 長辺の上限（px）。これを超える画像は縮小する。
# 検出器の入力は 1024px 固定なので、それ以上の解像度は速度だけを食う。
MAX_EDGE = 2600

# NDLOCR-Lite の前提バージョン（内部関数のシグネチャが変わる可能性がある）
SUPPORTED_VERSION = "2.0.0"


class OcrEngineError(RuntimeError):
    """エンジンの初期化・推論に失敗した。"""


class ImageDecodeError(OcrEngineError):
    """アップロードされた画像をデコードできなかった。"""


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """バイト列を RGB の numpy 配列にする（EXIF の回転を反映）。"""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except Exception as exc:  # PIL の例外は種類が多いのでまとめて扱う
        msg = "画像を読み込めません（JPEG / PNG / WebP / TIFF / BMP を使用してください）"
        raise ImageDecodeError(msg) from exc

    if max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    return np.array(image)


class NdlOcrEngine:
    """NDLOCR-Lite のモデルを 1 度だけ読み込み、画像を逐次処理する。

    onnxruntime のセッション自体はスレッドセーフだが、DEIM / PARSEQ の
    ラッパーは内部状態を持つため、推論はロックで直列化する。名刺 1 枚の
    処理は 1 秒未満なので、同時実行を 1 に絞っても実用上問題ない。
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ndlocr: Any = None
        self._detector: Any = None
        self._recognizer30: Any = None
        self._recognizer50: Any = None
        self._recognizer100: Any = None
        self._loaded = False
        self._load_error: str | None = None
        self._version: str | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def version(self) -> str | None:
        return self._version

    def load(self) -> None:
        """モデルを読み込む。失敗したら :class:`OcrEngineError` を投げる。"""
        if self._loaded:
            return
        try:
            import ocr as ndlocr
            from importlib.metadata import PackageNotFoundError
            from importlib.metadata import version as pkg_version
            from model_download import MODELS, resolve_model_paths
        except ImportError as exc:
            self._load_error = "ndlocr-lite がインストールされていません"
            msg = self._load_error
            raise OcrEngineError(msg) from exc

        try:
            self._version = pkg_version("ndlocr-lite")
        except PackageNotFoundError:
            self._version = None

        if not hasattr(ndlocr, "_run_ocr_on_image_array"):
            self._load_error = (
                f"ndlocr-lite の内部 API が見つかりません（対応版: {SUPPORTED_VERSION}）"
            )
            msg = self._load_error
            raise OcrEngineError(msg)

        base_dir = Path(ndlocr.__file__).resolve().parent
        args = argparse.Namespace(
            # モデルは resolve_model_paths がキャッシュ／ダウンロードから埋める
            **{option: None for option in MODELS},
            det_classes=str(base_dir / "config" / "ndl.yaml"),
            rec_classes=str(base_dir / "config" / "NDLmoji.yaml"),
            det_score_threshold=0.2,
            det_conf_threshold=0.25,
            det_iou_threshold=0.2,
            det_overlap_threshold=0.9,
            device="cpu",
            enable_tcy=False,
            simple_mode=False,
        )

        try:
            resolve_model_paths(args, base_dir / "model")
            self._detector = ndlocr.get_detector(args)
            self._recognizer100 = ndlocr.get_recognizer(args=args)
            self._recognizer30 = ndlocr.get_recognizer(
                args=args, weights_path=args.rec_weights30
            )
            self._recognizer50 = ndlocr.get_recognizer(
                args=args, weights_path=args.rec_weights50
            )
        except Exception as exc:
            self._load_error = f"NDLOCR-Lite のモデルを読み込めません: {exc}"
            msg = self._load_error
            raise OcrEngineError(msg) from exc

        self._ndlocr = ndlocr
        self._loaded = True
        self._load_error = None
        logger.info("NDLOCR-Lite %s を読み込みました", self._version)

    def recognize(self, image_bytes: bytes, filename: str = "card.png") -> dict[str, Any]:
        """画像 1 枚を OCR し、行単位の結果を返す。

        :raises OcrEngineError: モデル未ロード、または推論に失敗した。
        :raises ImageDecodeError: 画像をデコードできなかった。
        """
        if not self._loaded:
            msg = self._load_error or "OCR モデルがまだ読み込まれていません"
            raise OcrEngineError(msg)

        img = _decode_image(image_bytes)
        height, width = img.shape[:2]

        with self._lock:
            started = time.perf_counter()
            try:
                result = self._ndlocr._run_ocr_on_image_array(
                    detector=self._detector,
                    recognizer30=self._recognizer30,
                    recognizer50=self._recognizer50,
                    recognizer100=self._recognizer100,
                    inputname=filename,
                    img=img,
                    outputpath="",
                    save_viz=False,
                )
            except Exception as exc:
                msg = f"OCR の推論に失敗しました: {exc}"
                raise OcrEngineError(msg) from exc
            elapsed_ms = int((time.perf_counter() - started) * 1000)

        lines = [_to_line(item) for item in result.get("json_lines", [])]
        lines = [line for line in lines if line["text"]]

        return {
            "text": result.get("text", ""),
            "markdown": result.get("markdown_text", ""),
            "lines": lines,
            "width": width,
            "height": height,
            "elapsed_ms": elapsed_ms,
        }


def _to_line(item: dict[str, Any]) -> dict[str, Any]:
    """NDLOCR-Lite の 1 行分の JSON をこのサービスの形に直す。"""
    boxes = item.get("boundingBox") or []
    if len(boxes) >= 4:
        x0, y0 = boxes[0]
        x1 = boxes[2][0] if len(boxes[2]) > 0 else boxes[1][0]
        y1 = boxes[2][1] if len(boxes[2]) > 1 else boxes[1][1]
        left, top = int(min(x0, x1)), int(min(y0, y1))
        line_width, line_height = int(abs(x1 - x0)), int(abs(y1 - y0))
    else:
        left = top = line_width = line_height = 0

    return {
        "text": str(item.get("text", "")).strip(),
        "x": left,
        "y": top,
        "width": line_width,
        "height": line_height,
        "vertical": item.get("isVertical") == "true",
        "confidence": float(item.get("confidence") or 0.0),
    }
