"""名刺 OCR 計測の集計ロジック（外部 I/O を持たない純関数）。

文字起こし段階（CER・文字一致率）と構造化段階（項目一致率・捏造件数）を
分けて計算する。値そのものは戻り値に含めない（本番データを出力へ漏らさない）。
"""

from __future__ import annotations

import re
import statistics
import unicodedata
from typing import Any

# 構造化で比較する項目（配列の連絡先は別扱い）
SCALAR_FIELDS: tuple[str, ...] = (
    "last_name",
    "first_name",
    "last_name_kana",
    "first_name_kana",
    "company_name",
    "department",
    "position",
)
CONTACT_FIELDS: tuple[str, ...] = (
    "tel",
    "fax",
    "mobile",
    "email",
    "website",
    "address",
)


def normalize_text(text: str) -> str:
    """比較用の正規化（NFKC・空白除去）。表示用の値には使わない。"""
    value = unicodedata.normalize("NFKC", text or "")
    value = value.replace("\u3000", " ")
    return re.sub(r"\s+", "", value)


def edit_distance(left: str, right: str) -> int:
    """レーベンシュタイン距離。"""
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        for j, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current.append(
                min(
                    previous[j] + 1,  # 削除
                    current[j - 1] + 1,  # 挿入
                    previous[j - 1] + cost,  # 置換
                )
            )
        previous = current
    return previous[-1]


def character_error_rate(truth: str, actual: str) -> float:
    """正解文字数で割った文字誤り率（正解が空なら 0）。"""
    expected = normalize_text(truth)
    if not expected:
        return 0.0
    return edit_distance(expected, normalize_text(actual)) / len(expected)


def scalar_match(truth: dict[str, Any], actual: dict[str, Any]) -> dict[str, bool]:
    """項目ごとの完全一致（空同士も一致とみなす）。"""
    matched: dict[str, bool] = {}
    for field in SCALAR_FIELDS:
        expected = normalize_text(str(truth.get(field) or ""))
        got = normalize_text(str(actual.get(field) or ""))
        matched[field] = expected == got
    return matched


def contact_values(result: dict[str, Any]) -> dict[str, set[str]]:
    """連絡先を種別ごとの値集合にする（重複・順序を無視）。"""
    grouped: dict[str, set[str]] = {}
    for contact in result.get("contact_methods") or []:
        ctype = str(contact.get("type") or "other")
        value = normalize_text(str(contact.get("value") or ""))
        if value:
            grouped.setdefault(ctype, set()).add(value)
    return grouped


def contact_match(truth: dict[str, Any], actual: dict[str, Any]) -> dict[str, bool]:
    """種別ごとの連絡先集合の一致。"""
    expected = contact_values(truth)
    got = contact_values(actual)
    return {
        ctype: expected.get(ctype, set()) == got.get(ctype, set())
        for ctype in CONTACT_FIELDS
    }


def fabricated_fields(
    truth: dict[str, Any], actual: dict[str, Any], transcript: str
) -> list[str]:
    """画像に無い値を作った項目名を返す（値そのものは返さない）。

    条件: 空でない項目値が、同じ実行の文字起こしにも正解にも含まれない。
    どちらかに含まれる場合は「読み取り位置の取り違え」として捏造に数えない。
    """
    haystack = normalize_text(transcript)
    truth_blob = normalize_text(
        " ".join(str(truth.get(field) or "") for field in SCALAR_FIELDS)
    )
    fabricated: list[str] = []
    for field in SCALAR_FIELDS:
        value = normalize_text(str(actual.get(field) or ""))
        if not value:
            continue
        if value in haystack or value in truth_blob:
            continue
        fabricated.append(field)
    truth_contacts = contact_values(truth)
    for ctype, values in contact_values(actual).items():
        known = truth_contacts.get(ctype, set())
        for value in values:
            if value in haystack or value in known or value in truth_blob:
                continue
            fabricated.append(f"contact:{ctype}")
            break
    return fabricated


def summarize_card(
    truth: dict[str, Any],
    actual: dict[str, Any],
    transcript_truth: str,
    transcript_actual: str,
) -> dict[str, Any]:
    """1 枚分の指標。"""
    scalars = scalar_match(truth, actual)
    contacts = contact_match(truth, actual)
    checks = list(scalars.values()) + list(contacts.values())
    card_cer = character_error_rate(transcript_truth, transcript_actual)
    fabricated = fabricated_fields(truth, actual, transcript_actual)
    return {
        "cer": round(card_cer, 4),
        "char_accuracy": round(max(0.0, 1.0 - card_cer), 4),
        "scalar_matches": scalars,
        "contact_matches": contacts,
        "fields_checked": len(checks),
        "fields_matched": sum(1 for ok in checks if ok),
        "field_accuracy": round(sum(1 for ok in checks if ok) / len(checks), 4)
        if checks
        else 0.0,
        "fabricated": fabricated,
        "fabrication_count": len(fabricated),
    }


def aggregate_cards(cards: list[dict[str, Any]]) -> dict[str, Any]:
    """複数枚の指標をまとめる。"""
    if not cards:
        return {
            "cards": 0,
            "field_accuracy": 0.0,
            "char_accuracy": 0.0,
            "cer": 0.0,
            "fabrication_count": 0,
            "fabricated_cards": 0,
        }
    total_fields = sum(card["fields_checked"] for card in cards)
    total_matched = sum(card["fields_matched"] for card in cards)
    return {
        "cards": len(cards),
        "field_accuracy": round(total_matched / total_fields, 4)
        if total_fields
        else 0.0,
        "char_accuracy": round(
            statistics.fmean(card["char_accuracy"] for card in cards), 4
        ),
        "cer": round(statistics.fmean(card["cer"] for card in cards), 4),
        "fabrication_count": sum(card["fabrication_count"] for card in cards),
        "fabricated_cards": sum(1 for card in cards if card["fabrication_count"]),
    }


def variance(values: list[float]) -> dict[str, float]:
    """ばらつき（最小・最大・平均・標準偏差）。"""
    if not values:
        return {"min": 0.0, "max": 0.0, "mean": 0.0, "stdev": 0.0}
    return {
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "mean": round(statistics.fmean(values), 4),
        "stdev": round(statistics.pstdev(values), 4) if len(values) > 1 else 0.0,
    }


def unstable_fields(
    runs: list[dict[str, dict[str, Any]]], cards: list[str]
) -> dict[str, int]:
    """実行間で一致／不一致が入れ替わった枚数（項目ごと）。"""
    unstable: dict[str, int] = {}
    for field in SCALAR_FIELDS:
        changed = 0
        for stem in cards:
            seen = {
                bool(run.get(stem, {}).get("scalar_matches", {}).get(field))
                for run in runs
            }
            if len(seen) > 1:
                changed += 1
        unstable[field] = changed
    return unstable
