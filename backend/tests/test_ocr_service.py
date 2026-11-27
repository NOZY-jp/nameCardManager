"""OCR サービスの単体テスト。

外部APIは呼ばない（boto3 クライアントを差し替える）。
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from botocore.exceptions import ClientError

from app.core.config import Settings
from app.services import ocr


def make_settings(**kwargs: Any) -> Settings:
    """テスト用の設定。.env を読ませない。"""
    base: dict[str, Any] = {
        "ocr_provider": "bedrock",
        "aws_region": "us-east-1",
        "bedrock_model_id": "amazon.nova-lite-v1:0",
        "gemini_api_key": "",
    }
    base.update(kwargs)
    return Settings(_env_file=None, **base)


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32


class FakeClient:
    """converse だけを持つ偽クライアント。"""

    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def converse(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if not self.responses:
            msg = "no more fake responses"
            raise AssertionError(msg)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def converse_response(payload: dict[str, Any] | str) -> dict[str, Any]:
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return {
        "output": {"message": {"content": [{"text": text}]}},
        "usage": {"inputTokens": 480, "outputTokens": 210},
    }


CARD = {
    "first_name": "太郎",
    "last_name": "山田",
    "first_name_kana": "タロウ",
    "last_name_kana": "ヤマダ",
    "company_name": "株式会社サンプルテック",
    "department": "営業部",
    "position": "課長",
    "memo": None,
    "contact_methods": [
        {"type": "tel", "value": "03-1234-5678", "is_primary": True},
        {"type": "email", "value": "taro@example.co.jp", "is_primary": False},
    ],
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  画像形式
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@pytest.mark.parametrize(
    ("data", "expected"),
    [(JPEG, "jpeg"), (PNG, "png"), (WEBP, "webp"), (b"\x00\x01", "jpeg")],
)
def test_detect_image_format(data: bytes, expected: str) -> None:
    assert ocr.detect_image_format(data) == expected


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  応答のパース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_parse_json_response_plain() -> None:
    assert ocr.parse_json_response(json.dumps(CARD)) == CARD


def test_parse_json_response_with_code_fence() -> None:
    text = "```json\n" + json.dumps(CARD, ensure_ascii=False) + "\n```"
    assert ocr.parse_json_response(text)["last_name"] == "山田"


def test_parse_json_response_with_surrounding_text() -> None:
    text = "抽出結果は次のとおりです。\n" + json.dumps(CARD) + "\nご確認ください。"
    assert ocr.parse_json_response(text)["first_name"] == "太郎"


def test_parse_json_response_empty_raises() -> None:
    with pytest.raises(ocr.OcrError):
        ocr.parse_json_response("   ")


def test_parse_json_response_broken_raises() -> None:
    with pytest.raises(ocr.OcrError):
        ocr.parse_json_response("{壊れた JSON")


def test_parse_json_response_array_raises() -> None:
    with pytest.raises(ocr.OcrError):
        ocr.parse_json_response("[1, 2, 3]")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正規化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_normalize_fills_missing_keys() -> None:
    result = ocr.normalize_result({"first_name": "太郎"})
    assert result["first_name"] == "太郎"
    assert result["last_name"] == ""
    assert result["company_name"] is None
    assert result["contact_methods"] == []


def test_normalize_unknown_contact_type_becomes_other() -> None:
    result = ocr.normalize_result(
        {"contact_methods": [{"type": "beacon", "value": "x", "is_primary": True}]}
    )
    assert result["contact_methods"][0]["type"] == "other"


def test_normalize_forces_single_primary() -> None:
    result = ocr.normalize_result(
        {
            "contact_methods": [
                {"type": "tel", "value": "1", "is_primary": True},
                {"type": "email", "value": "2", "is_primary": True},
            ]
        }
    )
    assert [c["is_primary"] for c in result["contact_methods"]] == [True, False]


def test_normalize_sets_primary_when_none() -> None:
    result = ocr.normalize_result(
        {"contact_methods": [{"type": "tel", "value": "1", "is_primary": False}]}
    )
    assert result["contact_methods"][0]["is_primary"] is True


def test_normalize_drops_empty_contact_values() -> None:
    result = ocr.normalize_result(
        {
            "contact_methods": [
                {"type": "tel", "value": "  ", "is_primary": True},
                {"type": "email", "value": "a@example.com", "is_primary": False},
            ]
        }
    )
    assert len(result["contact_methods"]) == 1
    assert result["contact_methods"][0]["value"] == "a@example.com"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Bedrock
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_bedrock_sends_image_and_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient([converse_response(CARD)])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)

    result = ocr.extract_business_card(JPEG, make_settings())

    assert result["last_name"] == "山田"
    assert result["contact_methods"][0]["is_primary"] is True

    sent = client.calls[0]
    assert sent["modelId"] == "amazon.nova-lite-v1:0"
    content = sent["messages"][0]["content"]
    assert content[0]["text"].startswith("この名刺画像")
    assert content[1]["image"]["format"] == "jpeg"
    assert content[1]["image"]["source"]["bytes"] == JPEG
    assert sent["inferenceConfig"]["temperature"] == 0.0


def test_bedrock_uses_detected_png_format(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient([converse_response(CARD)])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)

    ocr.extract_business_card(PNG, make_settings())

    assert client.calls[0]["messages"][0]["content"][1]["image"]["format"] == "png"


def test_bedrock_retries_on_throttling(monkeypatch: pytest.MonkeyPatch) -> None:
    throttle = ClientError({"Error": {"Code": "ThrottlingException", "Message": "slow"}}, "Converse")
    client = FakeClient([throttle, converse_response(CARD)])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)
    monkeypatch.setattr(ocr.time, "sleep", lambda _s: None)

    result = ocr.extract_business_card(JPEG, make_settings())

    assert result["first_name"] == "太郎"
    assert len(client.calls) == 2


def test_bedrock_raises_on_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    error = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "bad model"}}, "Converse"
    )
    client = FakeClient([error])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)

    with pytest.raises(ocr.OcrError):
        ocr.extract_business_card(JPEG, make_settings())


def test_bedrock_empty_answer_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient([{"output": {"message": {"content": []}}, "usage": {}}])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)

    with pytest.raises(ocr.OcrError):
        ocr.extract_business_card(JPEG, make_settings())


def test_gif_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient([])
    monkeypatch.setattr(ocr, "_build_bedrock_client", lambda _settings: client)

    with pytest.raises(ocr.OcrError):
        ocr.extract_business_card(b"GIF89a" + b"\x00" * 16, make_settings())


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ選択
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_provider_none_skips_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(_settings: Settings) -> Any:
        msg = "呼ばれてはいけない"
        raise AssertionError(msg)

    monkeypatch.setattr(ocr, "_build_bedrock_client", boom)

    result = ocr.extract_business_card(JPEG, make_settings(ocr_provider="none"))
    assert result == ocr.empty_result()


def test_unknown_provider_raises() -> None:
    with pytest.raises(ocr.OcrError):
        ocr.extract_business_card(JPEG, make_settings(ocr_provider="wat"))


def test_gemini_without_key_raises() -> None:
    with pytest.raises(ocr.OcrError):
        ocr.extract_business_card(JPEG, make_settings(ocr_provider="gemini", gemini_api_key=""))


def test_safe_variant_returns_empty_on_error() -> None:
    error = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "no"}}, "Converse")
    client = FakeClient([error])

    settings = make_settings()
    original = ocr._build_bedrock_client
    ocr._build_bedrock_client = lambda _settings: client  # type: ignore[assignment]
    try:
        result = ocr.extract_business_card_safe(JPEG, settings)
    finally:
        ocr._build_bedrock_client = original  # type: ignore[assignment]

    assert result == ocr.empty_result()
