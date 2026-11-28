"""card_parser の単体テスト。

名刺テキストはすべてダミー（実在の人物・会社ではない）。
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import card_parser


def contacts_by_type(result: dict[str, Any]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for contact in result["contact_methods"]:
        grouped.setdefault(contact["type"], []).append(contact["value"])
    return grouped


HORIZONTAL = [
    "株式会社サンプルテック",
    "営業部 課長",
    "山田 太郎",
    "Taro Yamada",
    "〒150-0001",
    "東京都渋谷区神宮前1-2-3 サンプルビル8F",
    "TEL 03-1234-5678",
    "FAX 03-1234-5679",
    "Mobile 090-1234-5678",
    "taro.yamada@example.co.jp",
    "https://example.co.jp",
]


def test_horizontal_card_all_fields() -> None:
    result = card_parser.parse_card_text(HORIZONTAL)

    assert result["company_name"] == "株式会社サンプルテック"
    assert result["department"] == "営業部"
    assert result["position"] == "課長"
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"

    grouped = contacts_by_type(result)
    assert grouped["email"] == ["taro.yamada@example.co.jp"]
    assert grouped["mobile"] == ["090-1234-5678"]
    assert grouped["tel"] == ["03-1234-5678"]
    assert grouped["fax"] == ["03-1234-5679"]
    assert grouped["website"] == ["https://example.co.jp"]
    assert len(grouped["address"]) == 1
    assert "渋谷区神宮前1-2-3" in grouped["address"][0]
    assert "150-0001" in grouped["address"][0]


def test_primary_contact_is_email() -> None:
    result = card_parser.parse_card_text(HORIZONTAL)
    assert result["contact_methods"][0]["type"] == "email"
    assert result["contact_methods"][0]["is_primary"] is True
    assert sum(1 for c in result["contact_methods"] if c["is_primary"]) == 1


def test_unmatched_lines_go_to_memo() -> None:
    result = card_parser.parse_card_text(HORIZONTAL)
    # ローマ字氏名は専用の項目が無いので memo に残す
    assert result["memo"] is not None
    assert "Taro Yamada" in result["memo"]


def test_vertical_card_columns() -> None:
    """縦書きは列ごとに 1 行として返る。順序だけで判定できること。"""
    lines = [
        "株式会社サンプル商事",
        "取締役部長",
        "佐藤 花子",
        "営業本部",
        "〒530-0001",
        "大阪府大阪市北区梅田1-1-1",
        "TEL 06-1111-2222",
    ]
    result = card_parser.parse_card_text(lines)

    assert result["company_name"] == "株式会社サンプル商事"
    assert result["position"] == "取締役部長"
    assert result["department"] == "営業本部"
    assert result["last_name"] == "佐藤"
    assert result["first_name"] == "花子"
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["06-1111-2222"]
    assert "梅田1-1-1" in grouped["address"][0]


def test_company_prefix_and_department_on_one_line() -> None:
    result = card_parser.parse_card_text(
        ["株式会社サンプルテック 営業本部", "山田 太郎"]
    )
    assert result["company_name"] == "株式会社サンプルテック"
    assert result["department"] == "営業本部"


def test_department_and_position_share_a_character() -> None:
    result = card_parser.parse_card_text(["営業部長", "山田 太郎"])
    assert result["department"] == "営業部"
    assert result["position"] == "部長"


def test_position_dictionary_longest_match() -> None:
    result = card_parser.parse_card_text(["代表取締役社長", "山田 太郎"])
    assert result["position"] == "代表取締役社長"
    assert result["department"] is None


def test_unspaced_name_uses_surname_dictionary() -> None:
    result = card_parser.parse_card_text(["山田太郎"])
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"


def test_rare_kanji_is_kept_as_written() -> None:
    """異体字は照合だけに使い、保存する値は元の文字のまま。"""
    result = card_parser.parse_card_text(["髙橋 龍之介"])
    assert result["last_name"] == "髙橋"
    assert result["first_name"] == "龍之介"


def test_kana_line_fills_reading() -> None:
    result = card_parser.parse_card_text(["山田 太郎", "ヤマダ タロウ"])
    assert result["last_name_kana"] == "ヤマダ"
    assert result["first_name_kana"] == "タロウ"


def test_single_kana_token_is_not_guessed() -> None:
    """読みを分割できない場合は推測しない（memo に残す）。"""
    result = card_parser.parse_card_text(["山田 太郎", "ヤマダタロウ"])
    assert result["last_name_kana"] is None
    assert result["first_name_kana"] is None
    assert result["memo"] is not None
    assert "ヤマダタロウ" in result["memo"]


def test_unlabeled_mobile_number() -> None:
    result = card_parser.parse_card_text(["090-1234-5678"])
    grouped = contacts_by_type(result)
    assert grouped["mobile"] == ["090-1234-5678"]


def test_social_urls_are_typed() -> None:
    result = card_parser.parse_card_text(
        [
            "x.com/sample",
            "instagram.com/sample",
            "github.com/sample",
            "https://example.co.jp",
        ]
    )
    grouped = contacts_by_type(result)
    assert grouped["x"] == ["x.com/sample"]
    assert grouped["instagram"] == ["instagram.com/sample"]
    assert grouped["github"] == ["github.com/sample"]
    assert grouped["website"] == ["https://example.co.jp"]


def test_duplicate_contact_values_are_dropped() -> None:
    result = card_parser.parse_card_text(
        ["taro@example.co.jp", "Mail: taro@example.co.jp"]
    )
    grouped = contacts_by_type(result)
    assert grouped["email"] == ["taro@example.co.jp"]


def test_wrapped_address_is_joined() -> None:
    result = card_parser.parse_card_text(
        ["〒150-0001", "東京都渋谷区神宮前1-2-3", "サンプルビル8F"]
    )
    grouped = contacts_by_type(result)
    assert len(grouped["address"]) == 1
    assert grouped["address"][0].endswith("サンプルビル8F")


def test_no_fabrication_on_empty_input() -> None:
    result = card_parser.parse_card_text([])
    assert result["last_name"] == ""
    assert result["first_name"] == ""
    assert result["company_name"] is None
    assert result["contact_methods"] == []
    assert result["memo"] is None


def test_latin_only_card_is_not_guessed() -> None:
    result = card_parser.parse_card_text(
        ["SAMPLE TEC CO., LTD.", "Taro Yamada", "taro@example.co.jp"]
    )
    assert result["last_name"] == ""
    assert result["first_name"] == ""
    grouped = contacts_by_type(result)
    assert grouped["email"] == ["taro@example.co.jp"]
    assert result["memo"] is not None


def test_full_width_input_is_normalized() -> None:
    result = card_parser.parse_card_text(
        ["ＴＥＬ　０３－１２３４－５６７８", "ｔａｒｏ＠ｅｘａｍｐｌｅ．ｃｏ．ｊｐ"]
    )
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1234-5678"]
    assert grouped["email"] == ["taro@example.co.jp"]


@pytest.mark.parametrize(
    ("line", "expected_company"),
    [
        ("株式会社サンプル", "株式会社サンプル"),
        ("サンプル株式会社", "サンプル株式会社"),
        ("(株)サンプル", "(株)サンプル"),
        ("合同会社サンプル工業", "合同会社サンプル工業"),
    ],
)
def test_company_forms(line: str, expected_company: str) -> None:
    result = card_parser.parse_card_text([line])
    assert result["company_name"] == expected_company


def test_company_keyword_without_suffix() -> None:
    result = card_parser.parse_card_text(["サンプル製作所"])
    assert result["company_name"] == "サンプル製作所"


def test_postal_code_with_address_is_not_a_phone() -> None:
    """郵便番号＋住所の桁数が電話番号と同じでも tel にしない。"""
    result = card_parser.parse_card_text(
        ["231-0002神奈川県横浜市中区海岸通5-6-7", "TEL 045-987-6543"]
    )
    grouped = contacts_by_type(result)
    assert "tel" not in grouped or grouped["tel"] == ["045-987-6543"]
    assert len(grouped["tel"]) == 1
    assert "海岸通5-6-7" in grouped["address"][0]


def test_phone_with_parentheses() -> None:
    result = card_parser.parse_card_text(["TEL 03(1234)5678"])
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03(1234)5678"]


def test_phone_with_broken_label_prefix() -> None:
    """ラベルが「e」だけに化けても電話番号部分を拾う。"""
    result = card_parser.parse_card_text(["e 090-1234-5678"])
    grouped = contacts_by_type(result)
    assert grouped["mobile"] == ["090-1234-5678"]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TEL と FAX が同一行に並ぶ場合の分割
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def test_tel_and_fax_on_same_line_are_split() -> None:
    """TEL と FAX が 1 行に並んでも、それぞれの連絡先として分ける。"""
    result = card_parser.parse_card_text(
        ["TEL 03-1234-5678 FAX 03-1234-5679", "山田 太郎"]
    )
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1234-5678"]
    assert grouped["fax"] == ["03-1234-5679"]


def test_fax_before_tel_on_same_line_is_split() -> None:
    result = card_parser.parse_card_text(["FAX 03-9999-0000 TEL 03-1111-2222"])
    grouped = contacts_by_type(result)
    assert grouped["fax"] == ["03-9999-0000"]
    assert grouped["tel"] == ["03-1111-2222"]


def test_tel_and_fax_on_same_line_keeps_mobile_separate() -> None:
    result = card_parser.parse_card_text(
        ["Tel:03-1234-5678 Fax:03-1234-5679 Mobile:090-1234-5678"]
    )
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1234-5678"]
    assert grouped["fax"] == ["03-1234-5679"]
    assert grouped["mobile"] == ["090-1234-5678"]


def test_tel_and_fax_on_same_line_do_not_fabricate() -> None:
    """片方しか無い行では、もう片方を生成しない。"""
    result = card_parser.parse_card_text(["TEL 03-1234-5678"])
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1234-5678"]
    assert "fax" not in grouped


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  役職の表記ゆれ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("代表取締役社長", "代表取締役社長"),
        ("代表取締役 社長", "代表取締役社長"),
        ("代表取締役　社長", "代表取締役社長"),
        ("専務 取締役", "専務取締役"),
        ("執行 役員", "執行役員"),
        ("取締役 会長", "取締役会長"),
    ],
)
def test_position_spacing_is_normalized(line: str, expected: str) -> None:
    result = card_parser.parse_card_text([line, "山田 太郎"])
    assert result["position"] == expected


def test_plain_shachou_is_not_promoted() -> None:
    """「社長」だけの行を「代表取締役社長」に格上げしない（捏造禁止）。"""
    result = card_parser.parse_card_text(["社長", "山田 太郎"])
    assert result["position"] == "社長"


def test_position_and_department_with_spacing() -> None:
    result = card_parser.parse_card_text(["営業部 課長", "山田 太郎"])
    assert result["department"] == "営業部"
    assert result["position"] == "課長"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  氏名が複数行に割れる場合の結合
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def test_name_split_across_two_lines_is_joined() -> None:
    """姓と名が別の行に分かれても、隣接していれば 1 人として結合する。"""
    result = card_parser.parse_card_text(
        ["株式会社サンプルテック", "山田", "太郎", "TEL 03-1234-5678"]
    )
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"
    memo = result["memo"] or ""
    assert "太郎" not in memo.split("\n")


def test_name_split_lines_are_joined_with_kana() -> None:
    result = card_parser.parse_card_text(["山田", "太郎", "ヤマダ タロウ"])
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"
    assert result["last_name_kana"] == "ヤマダ"
    assert result["first_name_kana"] == "タロウ"


def test_surname_only_line_is_not_joined_with_unrelated_line() -> None:
    """辞書に無い語や、名として不自然な行は結合しない（捏造禁止）。"""
    result = card_parser.parse_card_text(["株式会社サンプルテック", "山田", "営業部長"])
    assert result["last_name"] == "山田"
    assert result["first_name"] == ""
    assert result["position"] == "部長"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  氏名＋フリガナが同一行（括弧書き）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def test_name_with_fullwidth_parenthesized_kana() -> None:
    """氏名の後ろに全角括弧でフリガナが並ぶ行も氏名として扱う。"""
    result = card_parser.parse_card_text(
        [
            "株式会社サンプル商事",
            "営業本部 部長",
            "山田 太郎（ヤマダ タロウ）",
            "TEL 03-1111-2222",
        ]
    )
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"
    assert result["last_name_kana"] == "ヤマダ"
    assert result["first_name_kana"] == "タロウ"
    assert result["department"] == "営業本部"
    assert result["position"] == "部長"
    assert result["memo"] is None or "山田" not in result["memo"]


def test_name_with_halfwidth_parenthesized_kana() -> None:
    result = card_parser.parse_card_text(
        ["合同会社テスト工業", "代表取締役", "高橋 龍之介(タカハシ リュウノスケ)"]
    )
    assert result["last_name"] == "高橋"
    assert result["first_name"] == "龍之介"
    assert result["last_name_kana"] == "タカハシ"
    assert result["first_name_kana"] == "リュウノスケ"


def test_parenthesized_kana_without_split_is_not_guessed() -> None:
    """カナが 2 トークンに分かれない場合は推測せず、氏名だけ確定する。"""
    result = card_parser.parse_card_text(["山田 太郎（ヤマダタロウ）"])
    assert result["last_name"] == "山田"
    assert result["first_name"] == "太郎"
    assert result["last_name_kana"] is None
    assert result["first_name_kana"] is None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ラベルだけの行・行末ラベルで番号が次行へ折り返す場合
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def test_tel_line_ending_with_fax_label_wraps_number() -> None:
    result = card_parser.parse_card_text(["TEL 03-1111-2222 FAX", "03-3333-4444"])
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1111-2222"]
    assert grouped["fax"] == ["03-3333-4444"]
    assert result["memo"] is None or "FAX" not in result["memo"]


def test_label_only_line_then_number() -> None:
    result = card_parser.parse_card_text(["TEL 03-1111-2222", "FAX", "03-3333-4444"])
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1111-2222"]
    assert grouped["fax"] == ["03-3333-4444"]
    assert result["memo"] is None or "FAX" not in result["memo"]


def test_mobile_label_wrap_is_mobile() -> None:
    result = card_parser.parse_card_text(
        ["TEL 03-1111-2222", "Mobile", "090-1234-5678"]
    )
    grouped = contacts_by_type(result)
    assert grouped["tel"] == ["03-1111-2222"]
    assert grouped["mobile"] == ["090-1234-5678"]


def test_dangling_label_without_number_is_kept_in_memo() -> None:
    """番号が続かないラベル語は捨てず memo に残す。"""
    result = card_parser.parse_card_text(["FAX", "担当: 山田"])
    assert result["contact_methods"] == []
    assert result["memo"] is not None
    assert "FAX" in result["memo"]
    assert "担当: 山田" in result["memo"]
