"""計測用の OCR 呼び出し（本番と同じ Vertex 設定 / オフラインの fake）。

本番アプリの :mod:`app.services.ocr` を読み取り専用で再利用し、計測だけの
文字起こしプロンプトを追加する。プロダクトコードは変更しない。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings, get_settings
from app.services import ocr

TRANSCRIBE_PROMPT = """この名刺画像に書かれている文字を、上から下・左から右の順に、
一字一句そのまま書き写してください。

禁止事項:
- 画像に無い文字・氏名・住所・電話番号を補わない
- 読めない文字は推測せず、その位置に「?」を 1 文字置く
- 説明や前置きを書かず、書き写した文字だけを返す"""


@dataclass
class OcrOutcome:
    """1 回の呼び出し結果。"""

    transcript: str
    structured: dict[str, Any]
    elapsed_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


class VertexBenchProvider:
    """本番と同じ Vertex AI（gemini）設定で 2 段階の計測を行う。"""

    name = "vertex"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.model = self.settings.vertex_model
        if self.settings.ocr_provider != "vertex":
            # 計測は本番と同じプロバイダ設定でだけ行う（取り違え防止）
            self.settings = self.settings.model_copy(update={"ocr_provider": "vertex"})

    def transcribe(self, image_bytes: bytes, stem: str = "") -> OcrOutcome:
        from google.genai import types

        client = ocr._build_vertex_client(self.settings)  # noqa: SLF001
        image_format = ocr.detect_image_format(image_bytes)
        started = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_text(text=TRANSCRIBE_PROMPT),
                    types.Part.from_bytes(
                        data=image_bytes, mime_type=f"image/{image_format}"
                    ),
                ],
                config=types.GenerateContentConfig(temperature=0.0),
            )
        except Exception as exc:  # SDK 固有の例外をまとめて扱う
            msg = f"Vertex AI の文字起こしに失敗しました: {exc}"
            raise ocr.OcrError(msg) from exc
        elapsed_ms = (time.perf_counter() - started) * 1000
        text = getattr(response, "text", "") or ""
        usage = getattr(response, "usage_metadata", None)
        return OcrOutcome(
            transcript=text,
            structured=ocr.empty_result(),
            elapsed_ms=elapsed_ms,
            input_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
            output_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
            meta={"model": self.model},
        )

    def structure(self, image_bytes: bytes, stem: str = "") -> OcrOutcome:
        """本番と同じプロンプト・スキーマ・温度で構造化し、トークン数も取る。"""
        from google.genai import types

        client = ocr._build_vertex_client(self.settings)  # noqa: SLF001
        image_format = ocr.detect_image_format(image_bytes)
        started = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_text(text=ocr.OCR_PROMPT),
                    types.Part.from_bytes(
                        data=image_bytes, mime_type=f"image/{image_format}"
                    ),
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ocr.OCR_RESPONSE_SCHEMA,
                    temperature=0.0,
                ),
            )
        except Exception as exc:  # SDK 固有の例外をまとめて扱う
            msg = f"Vertex AI の構造化に失敗しました: {exc}"
            raise ocr.OcrError(msg) from exc
        elapsed_ms = (time.perf_counter() - started) * 1000
        text = getattr(response, "text", "") or ""
        if not text.strip():
            msg = "Vertex AI の応答が空です"
            raise ocr.OcrError(msg)
        usage = getattr(response, "usage_metadata", None)
        return OcrOutcome(
            transcript="",
            structured=ocr.parse_json_response(text),
            elapsed_ms=elapsed_ms,
            input_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
            output_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
            meta={"model": self.model},
        )


class FakeProvider:
    """ネットワークを使わない計測（スクリプトの疎通確認・単体テスト用）。"""

    name = "fake"
    model = "fake-model"

    def __init__(self, transcripts: dict[str, str] | None = None) -> None:
        self.transcripts = transcripts or {}

    def transcribe(self, image_bytes: bytes, stem: str = "") -> OcrOutcome:
        return OcrOutcome(
            transcript=self.transcripts.get(stem, "サンプル 太郎\n03-1234-5678"),
            structured=ocr.empty_result(),
            elapsed_ms=1.0,
            input_tokens=100,
            output_tokens=20,
        )

    def structure(self, image_bytes: bytes, stem: str = "") -> OcrOutcome:
        result = ocr.empty_result()
        result["last_name"] = "サンプル"
        result["first_name"] = "太郎"
        result["position"] = "課長"
        result["contact_methods"] = [
            {"type": "tel", "value": "03-1234-5678", "is_primary": True}
        ]
        return OcrOutcome(
            transcript="",
            structured=result,
            elapsed_ms=2.0,
            input_tokens=200,
            output_tokens=40,
        )
