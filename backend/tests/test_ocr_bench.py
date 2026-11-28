"""ocr_bench（計測スクリプト）の単体テスト。

ダミー画像 1 枚を fake プロバイダで処理し、外部通信なしで最後まで動くこと、
集計値だけが出力に残ることを確認する。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from tools.ocr_bench import measure, metrics

TRUTH = {
    "last_name": "サンプル",
    "first_name": "太郎",
    "last_name_kana": None,
    "first_name_kana": None,
    "company_name": None,
    "department": None,
    "position": "課長",
    "transcript": "サンプル 太郎\n03-1234-5678",
    "contact_methods": [{"type": "tel", "value": "03-1234-5678"}],
}


def _make_png(path: Path) -> None:
    Image.new("RGB", (40, 24), "white").save(path)


def test_cli_runs_twice_on_dummy_image(tmp_path: Path) -> None:
    images = tmp_path / "images"
    images.mkdir()
    _make_png(images / "card1.png")
    truth_path = tmp_path / "truth.json"
    truth_path.write_text(
        json.dumps({"card1": TRUTH}, ensure_ascii=False), encoding="utf-8"
    )
    out = tmp_path / "result.json"

    code = measure.main(
        [
            "--images",
            str(images),
            "--truth",
            str(truth_path),
            "--out",
            str(out),
            "--provider",
            "fake",
            "--runs",
            "2",
        ]
    )

    assert code == 0
    result = json.loads(out.read_text(encoding="utf-8"))
    assert result["images"] == 1
    assert len(result["runs"]) == 2
    assert result["runs"][0]["cards"] == 1
    assert result["runs"][0]["field_accuracy"] == 1.0
    assert result["variance"]["field_accuracy"]["stdev"] == 0.0
    assert result["errors"] == []


def test_output_contains_no_raw_text(tmp_path: Path) -> None:
    """本番データを扱っても、出力に本文・氏名を残さない。"""
    images = tmp_path / "images"
    images.mkdir()
    _make_png(images / "card1.png")
    truth_path = tmp_path / "truth.json"
    truth_path.write_text(
        json.dumps({"card1": TRUTH}, ensure_ascii=False), encoding="utf-8"
    )
    out = tmp_path / "result.json"

    measure.main(
        [
            "--images",
            str(images),
            "--truth",
            str(truth_path),
            "--out",
            str(out),
            "--provider",
            "fake",
            "--runs",
            "2",
        ]
    )

    text = out.read_text(encoding="utf-8")
    assert "サンプル" not in text
    assert "太郎" not in text
    assert "03-1234-5678" not in text


def test_character_error_rate() -> None:
    assert metrics.character_error_rate("山田太郎", "山田太郎") == 0.0
    assert metrics.character_error_rate("山田太郎", "山田次郎") == 0.25
    assert metrics.character_error_rate("", "") == 0.0


def test_fabrication_is_counted_without_value() -> None:
    truth = {
        "last_name": "山田",
        "first_name": "太郎",
        "company_name": None,
        "department": None,
        "position": None,
        "last_name_kana": None,
        "first_name_kana": None,
        "contact_methods": [],
    }
    actual = dict(truth)
    actual["company_name"] = "架空商事"  # 文字起こしにも正解にも無い
    fabricated = metrics.fabricated_fields(truth, actual, "山田 太郎")
    assert fabricated == ["company_name"]


def test_contact_comparison_ignores_order() -> None:
    truth = {
        "contact_methods": [
            {"type": "tel", "value": "03-1111-2222"},
            {"type": "email", "value": "a@example.com"},
        ]
    }
    actual = {
        "contact_methods": [
            {"type": "email", "value": "a@example.com"},
            {"type": "tel", "value": "03-1111-2222"},
        ]
    }
    matches = metrics.contact_match(truth, actual)
    assert matches["tel"] is True
    assert matches["email"] is True


def test_missing_truth_is_recorded_as_error(tmp_path: Path) -> None:
    images = tmp_path / "images"
    images.mkdir()
    _make_png(images / "unknown.png")
    truth_path = tmp_path / "truth.json"
    truth_path.write_text("{}", encoding="utf-8")
    out = tmp_path / "result.json"

    code = measure.main(
        [
            "--images",
            str(images),
            "--truth",
            str(truth_path),
            "--out",
            str(out),
            "--provider",
            "fake",
            "--runs",
            "2",
        ]
    )

    assert code == 1
    result = json.loads(out.read_text(encoding="utf-8"))
    assert result["errors"] == [{"card": "card-01", "error": "truth_missing"}] * 2


def _dummy_inputs(tmp_path: Path) -> tuple[Path, Path]:
    images = tmp_path / "images"
    images.mkdir()
    _make_png(images / "card1.png")
    truth_path = tmp_path / "truth.json"
    truth_path.write_text(
        json.dumps({"card1": TRUTH}, ensure_ascii=False), encoding="utf-8"
    )
    return images, truth_path


def test_cli_rejects_fewer_than_two_runs(tmp_path: Path) -> None:
    """受け入れ条件(3): 同じ画像・設定で最低 2 回。0/1 回は受け付けない。"""
    images, truth_path = _dummy_inputs(tmp_path)
    for runs in ("0", "1"):
        out = tmp_path / f"result-{runs}.json"
        try:
            code = measure.main(
                [
                    "--images",
                    str(images),
                    "--truth",
                    str(truth_path),
                    "--out",
                    str(out),
                    "--provider",
                    "fake",
                    "--runs",
                    runs,
                ]
            )
        except SystemExit as exc:  # argparse の引数エラー
            code = exc.code
        assert code not in (0, None)
        assert not out.exists()


def test_variance_does_not_fake_zero_spread() -> None:
    """1 件以下では σ を返さない（0 を捏造しない）。"""
    empty = metrics.variance([])
    single = metrics.variance([0.5])
    assert empty["samples"] == 0
    assert "stdev" not in empty
    assert single["samples"] == 1
    assert "stdev" not in single
    assert single["mean"] == 0.5

    pair = metrics.variance([0.5, 0.7])
    assert pair["samples"] == 2
    assert pair["stdev"] > 0


def test_output_has_no_filename_identifiers(tmp_path: Path) -> None:
    """ファイル名に氏名らしき文字列があっても、出力には現れない。"""
    images = tmp_path / "images"
    images.mkdir()
    _make_png(images / "山田太郎_本物.png")
    truth_path = tmp_path / "truth.json"
    truth_path.write_text(
        json.dumps({"山田太郎_本物": TRUTH}, ensure_ascii=False), encoding="utf-8"
    )
    out = tmp_path / "result.json"

    measure.main(
        [
            "--images",
            str(images),
            "--truth",
            str(truth_path),
            "--out",
            str(out),
            "--provider",
            "fake",
            "--runs",
            "2",
        ]
    )

    text = out.read_text(encoding="utf-8")
    assert "山田太郎_本物" not in text
    assert "山田" not in text
    result = json.loads(text)
    assert list(result["runs"][0]["card_details"]) == ["card-01"]


def test_variance_is_zero_for_two_identical_values() -> None:
    same = metrics.variance([0.987, 0.987])
    assert same["samples"] == 2
    assert same["stdev"] == 0.0
