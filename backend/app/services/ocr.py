"""名刺画像の OCR。

プロバイダは `OCR_PROVIDER` で切り替える。

- ``bedrock``: Amazon Bedrock（Amazon Nova Lite など）。後払い・画像1枚230トークン固定課金。
- ``ndl``: 自前の NDLOCR-Lite サービス（``ocr-service``）。日本語・縦書き対応、無料、
  名刺画像はサーバー外に出ない。文字起こしだけを任せ、項目の切り出しは
  :mod:`app.services.card_parser` の辞書・正規表現で行う。
- ``gemini``: Google Gemini（従来実装）。プリペイド残高が必要。
- ``none``: 外部呼び出しをせず空の結果を返す（開発・テスト用）。

呼び出し側は :func:`extract_business_card` だけを使えばよい。
失敗は :class:`OcrError` で通知する（空の名刺を黙って返さない）。
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.core.config import Settings, get_settings
from app.services import card_parser

logger = logging.getLogger(__name__)

# 連絡先の種別（フロントの型と一致させる）
CONTACT_METHOD_TYPES: list[str] = [
    "email",
    "tel",
    "mobile",
    "fax",
    "website",
    "x",
    "instagram",
    "youtube",
    "discord",
    "booth",
    "github",
    "linkedin",
    "facebook",
    "line",
    "tiktok",
    "address",
    "other",
]

_CONTACT_TYPE_SET = set(CONTACT_METHOD_TYPES)

# Gemini の structured output 用スキーマ（OpenAPI サブセット）。
# Bedrock はスキーマ指定に対応しないため、同じ形をプロンプトで要求しパースする。
OCR_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "first_name": {"type": "string"},
        "last_name": {"type": "string"},
        "first_name_kana": {"type": "string", "nullable": True},
        "last_name_kana": {"type": "string", "nullable": True},
        "company_name": {"type": "string", "nullable": True},
        "department": {"type": "string", "nullable": True},
        "position": {"type": "string", "nullable": True},
        "memo": {"type": "string", "nullable": True},
        "contact_methods": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": CONTACT_METHOD_TYPES},
                    "value": {"type": "string"},
                    "is_primary": {"type": "boolean"},
                },
                "required": ["type", "value", "is_primary"],
            },
        },
    },
    "required": ["first_name", "last_name", "contact_methods"],
}

OCR_PROMPT = """この名刺画像から情報を JSON で抽出します。次の順で行ってください。
1. 画像の文字を一字一句そのまま書き写す（transcript）
2. transcript に実在する文字列だけを各項目に切り出す

項目: transcript, last_name, first_name, last_name_kana, first_name_kana,
company_name, department, position, memo, contact_methods({type, value, is_primary})

禁止事項（重要）:
- 画像に無い住所・社名・電話番号・メール・フリガナを作らない
- 読めない漢字を別の漢字に置き換えない（読めない項目は null）
- フリガナは画像に明記されている場合のみ入れる。推測しない
- 縦書きの場合は行ごとに読み、列の順に並べる

contact_methods の type は email, tel, mobile, fax, website, x, instagram, youtube,
discord, booth, github, linkedin, facebook, line, tiktok, address, other のいずれか。
is_primary は先頭の 1 件のみ true。
JSON のみを返してください。マークダウンコードブロックは不要です。"""

_NULLABLE_FIELDS = (
    "first_name_kana",
    "last_name_kana",
    "company_name",
    "department",
    "position",
    "memo",
)


class OcrError(RuntimeError):
    """OCR プロバイダの呼び出しに失敗した。"""


def empty_result() -> dict[str, Any]:
    """項目をすべて空にした結果。テストやプロバイダ未設定時に使う。"""
    return {
        "first_name": "",
        "last_name": "",
        "first_name_kana": None,
        "last_name_kana": None,
        "company_name": None,
        "department": None,
        "position": None,
        "memo": None,
        "contact_methods": [],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  画像形式
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def detect_image_format(image_bytes: bytes) -> str:
    """マジックバイトから画像形式を返す（jpeg / png / webp / gif）。

    判定できない場合は jpeg とみなす。
    """
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "webp"
    if image_bytes[:4] == b"GIF8":
        return "gif"
    return "jpeg"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  パースと正規化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def parse_json_response(text: str) -> dict[str, Any]:
    """モデルの応答から JSON オブジェクトを取り出す。

    コードフェンスや前後の説明文が付いていても拾えるようにする。
    """
    raw = (text or "").strip()
    if not raw:
        msg = "OCR の応答が空です"
        raise OcrError(msg)

    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[: -len("```")]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            msg = "OCR の応答を JSON として解釈できません"
            raise OcrError(msg) from None
        try:
            parsed = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as exc:
            msg = f"OCR の応答を JSON として解釈できません: {exc}"
            raise OcrError(msg) from exc

    if not isinstance(parsed, dict):
        msg = "OCR の応答が JSON オブジェクトではありません"
        raise OcrError(msg)
    return parsed


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_result(raw: dict[str, Any]) -> dict[str, Any]:
    """モデルの出力をアプリの期待する形に整える。

    - すべてのキーを揃える（欠けは空）
    - 連絡先の type を既知の値に丸める
    - is_primary が複数/ゼロにならないようにする（先頭のみ true）
    """
    result = empty_result()
    result["first_name"] = _clean_str(raw.get("first_name")) or ""
    result["last_name"] = _clean_str(raw.get("last_name")) or ""
    for field in _NULLABLE_FIELDS:
        result[field] = _clean_str(raw.get(field))

    contacts: list[dict[str, Any]] = []
    raw_contacts = raw.get("contact_methods")
    if isinstance(raw_contacts, list):
        for item in raw_contacts:
            if not isinstance(item, dict):
                continue
            value = _clean_str(item.get("value"))
            if not value:
                continue
            ctype = _clean_str(item.get("type")) or "other"
            ctype = ctype.lower()
            if ctype not in _CONTACT_TYPE_SET:
                ctype = "other"
            contacts.append({"type": ctype, "value": value, "is_primary": False})

    if contacts:
        contacts[0]["is_primary"] = True
    result["contact_methods"] = contacts
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ: Amazon Bedrock
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_THROTTLE_CODES = {"ThrottlingException", "TooManyRequestsException"}


def _build_bedrock_client(settings: Settings) -> Any:
    import boto3  # 遅延 import（未導入の環境でも他プロバイダで動かす）
    from botocore.config import Config

    return boto3.client(
        "bedrock-runtime",
        region_name=settings.aws_region,
        config=Config(
            connect_timeout=settings.ocr_timeout_seconds,
            read_timeout=settings.ocr_timeout_seconds,
            retries={"max_attempts": 0},
        ),
    )


def _ocr_bedrock(image_bytes: bytes, settings: Settings) -> dict[str, Any]:
    from botocore.exceptions import BotoCoreError, ClientError

    image_format = detect_image_format(image_bytes)
    if image_format == "gif":
        # Converse API の画像形式に対応しないため JPEG として送らない
        msg = "GIF は OCR に未対応です（JPEG/PNG/WebP を使用してください）"
        raise OcrError(msg)

    client = _build_bedrock_client(settings)
    request: dict[str, Any] = {
        "modelId": settings.bedrock_model_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"text": OCR_PROMPT},
                    {"image": {"format": image_format, "source": {"bytes": image_bytes}}},
                ],
            }
        ],
        "inferenceConfig": {
            "maxTokens": settings.ocr_max_tokens,
            "temperature": 0.0,
            "topP": 0.9,
        },
    }

    response: dict[str, Any] | None = None
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.converse(**request)
            break
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            last_error = exc
            if code in _THROTTLE_CODES and attempt == 0:
                time.sleep(0.5)
                continue
            msg = f"Bedrock 呼び出しに失敗しました: {code or 'unknown'}"
            raise OcrError(msg) from exc
        except (BotoCoreError, OSError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.5)
                continue
            msg = f"Bedrock へ接続できません: {exc}"
            raise OcrError(msg) from exc

    if response is None:
        msg = f"Bedrock の応答を取得できません: {last_error}"
        raise OcrError(msg)

    blocks = response.get("output", {}).get("message", {}).get("content", [])
    text = "".join(block.get("text", "") for block in blocks)
    if not text.strip():
        msg = "Bedrock の応答が空です"
        raise OcrError(msg)

    usage = response.get("usage", {})
    logger.info(
        "bedrock ocr done model=%s in=%s out=%s",
        settings.bedrock_model_id,
        usage.get("inputTokens"),
        usage.get("outputTokens"),
    )
    return parse_json_response(text)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ: Google Gemini（従来実装）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _ocr_gemini(image_bytes: bytes, settings: Settings) -> dict[str, Any]:
    if not settings.gemini_api_key:
        msg = "GEMINI_API_KEY が設定されていません"
        raise OcrError(msg)

    import base64

    from google import genai  # type: ignore[import-untyped]
    from google.genai import types  # type: ignore[import-untyped]

    client = genai.Client(api_key=settings.gemini_api_key)
    image_data = base64.b64encode(image_bytes).decode("utf-8")
    mime = f"image/{detect_image_format(image_bytes)}"

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                {
                    "parts": [
                        {"text": OCR_PROMPT},
                        {"inline_data": {"mime_type": mime, "data": image_data}},
                    ]
                }
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OCR_RESPONSE_SCHEMA,
            ),
        )
    except Exception as exc:  # ライブラリ固有の例外をまとめて扱う
        msg = f"Gemini 呼び出しに失敗しました: {exc}"
        raise OcrError(msg) from exc

    return parse_json_response(getattr(response, "text", "") or "")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ: 自前の NDLOCR-Lite サービス
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _ocr_ndl(image_bytes: bytes, settings: Settings) -> dict[str, Any]:
    """名刺画像を ``ocr-service`` に送り、返ってきた行を項目に切り出す。

    LLM を使わないため、画像に無い住所や氏名が生成されることはない。
    """
    import httpx

    if not settings.ocr_service_url:
        msg = "OCR_SERVICE_URL が設定されていません"
        raise OcrError(msg)

    image_format = detect_image_format(image_bytes)
    url = f"{settings.ocr_service_url.rstrip('/')}/ocr"
    files = {"file": (f"card.{image_format}", image_bytes, f"image/{image_format}")}

    try:
        with httpx.Client(timeout=settings.ocr_timeout_seconds) as client:
            response = client.post(url, files=files)
    except httpx.TimeoutException as exc:
        msg = f"OCR サービスがタイムアウトしました（{settings.ocr_timeout_seconds}秒）"
        raise OcrError(msg) from exc
    except httpx.HTTPError as exc:
        msg = f"OCR サービスへ接続できません: {exc}"
        raise OcrError(msg) from exc

    if response.status_code != httpx.codes.OK:
        detail = ""
        try:
            detail = str(response.json().get("detail", ""))
        except ValueError:
            detail = response.text[:200]
        msg = f"OCR サービスが {response.status_code} を返しました: {detail}"
        raise OcrError(msg)

    try:
        payload = response.json()
    except ValueError as exc:
        msg = "OCR サービスの応答を JSON として解釈できません"
        raise OcrError(msg) from exc

    lines = [str(line.get("text", "")) for line in payload.get("lines", [])]
    raw_text = str(payload.get("text", ""))
    if not any(line.strip() for line in lines) and not raw_text.strip():
        logger.info("ndl ocr returned no text (elapsed_ms=%s)", payload.get("elapsed_ms"))
        return empty_result()

    logger.info(
        "ndl ocr done lines=%d elapsed_ms=%s",
        len(lines),
        payload.get("elapsed_ms"),
    )
    return card_parser.parse_card_text(lines, raw_text)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  入口
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_PROVIDERS = {
    "bedrock": _ocr_bedrock,
    "ndl": _ocr_ndl,
    "gemini": _ocr_gemini,
}


def extract_business_card(
    image_bytes: bytes, settings: Settings | None = None
) -> dict[str, Any]:
    """名刺画像から項目を抽出する。

    :raises OcrError: プロバイダが失敗した、または設定が不足している。
    """
    settings = settings or get_settings()
    provider = (settings.ocr_provider or "none").strip().lower()

    if provider == "none":
        logger.warning("OCR_PROVIDER=none のため OCR を実行しません")
        return empty_result()

    handler = _PROVIDERS.get(provider)
    if handler is None:
        msg = f"未知の OCR_PROVIDER です: {provider}（ndl / bedrock / gemini / none）"
        raise OcrError(msg)

    raw = handler(image_bytes, settings)
    return normalize_result(raw)


def extract_business_card_safe(
    image_bytes: bytes, settings: Settings | None = None
) -> dict[str, Any]:
    """失敗しても例外を投げず空の結果を返す版（従来の挙動）。

    失敗を利用者に見せたい場合は :func:`extract_business_card` を使う。
    """
    try:
        return extract_business_card(image_bytes, settings)
    except OcrError:
        logger.exception("OCR failed; returning empty result")
        return empty_result()
