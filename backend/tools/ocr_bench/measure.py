"""名刺 OCR の精度を、文字起こし段階と構造化段階に分けて計測する。

使い方（backend ディレクトリで）::

    uv run python -m tools.ocr_bench.measure \
        --images ../eval/cards --truth ../eval/truth.json --out ../eval/result.json \
        --provider vertex --runs 2

- ``--images``: 名刺画像のディレクトリ（jpg/png/webp）
- ``--truth``: 正解 JSON（1 ファイル）または 1 枚 1 JSON のディレクトリ
- ``--out``: 集計結果の出力先（値は含めない。集計値だけ）
- ``--runs``: 同じ画像・同じ設定で繰り返す回数（既定 2）

本番データを扱うときは ``--save-text`` を使わない（生の文字起こしを残さない）。
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from app.services import ocr
from tools.ocr_bench import metrics
from tools.ocr_bench.providers import FakeProvider, VertexBenchProvider

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

# 参考単価（円/枚）。リポジトリの project.md に記録された本番実測値。
DEFAULT_JPY_PER_CARD = 0.14


def load_truth(path: Path) -> dict[str, dict[str, Any]]:
    """正解データを読み込む（1 ファイル JSON か、1 枚 1 JSON のディレクトリ）。"""
    if path.is_dir():
        truth: dict[str, dict[str, Any]] = {}
        for item in sorted(path.iterdir()):
            if item.suffix.lower() != ".json":
                continue
            data = json.loads(item.read_text(encoding="utf-8"))
            stem = str(data.pop("stem", item.stem))
            text_file = item.with_suffix(".txt")
            if text_file.exists():
                data.setdefault("transcript", text_file.read_text(encoding="utf-8"))
            truth[stem] = data
        return truth
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        msg = "正解ファイルは {stem: {...}} の JSON にしてください"
        raise ValueError(msg)
    return {str(key): value for key, value in data.items()}


def find_images(directory: Path) -> list[Path]:
    return sorted(
        item
        for item in directory.iterdir()
        if item.is_file() and item.suffix.lower() in IMAGE_SUFFIXES
    )


def build_provider(name: str) -> Any:
    if name == "fake":
        return FakeProvider()
    return VertexBenchProvider()


def run_once(
    provider: Any,
    images: list[Path],
    truth: dict[str, dict[str, Any]],
    save_text: Path | None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, float], dict[str, Any]]:
    """1 回分の計測。集計・エラー・使用量・カード別指標を返す。"""
    cards: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    transcribe_ms: list[float] = []
    structure_ms: list[float] = []
    tokens = {"input": 0, "output": 0}

    for image in images:
        stem = image.stem
        expected = truth.get(stem)
        if expected is None:
            errors.append({"stem": stem, "error": "truth_missing"})
            continue
        image_bytes = image.read_bytes()
        try:
            transcribed = provider.transcribe(image_bytes, stem=stem)
            structured = provider.structure(image_bytes, stem=stem)
        except Exception as exc:  # 1 枚の失敗で全体を止めない
            errors.append({"stem": stem, "error": type(exc).__name__})
            continue

        actual = ocr.normalize_result(structured.structured)
        card = metrics.summarize_card(
            expected,
            actual,
            str(expected.get("transcript") or ""),
            transcribed.transcript,
        )
        cards[stem] = card
        transcribe_ms.append(transcribed.elapsed_ms)
        structure_ms.append(structured.elapsed_ms)
        tokens["input"] += transcribed.input_tokens + structured.input_tokens
        tokens["output"] += transcribed.output_tokens + structured.output_tokens
        if save_text is not None:
            save_text.mkdir(parents=True, exist_ok=True)
            (save_text / f"{stem}.json").write_text(
                json.dumps(
                    {
                        "transcript": transcribed.transcript,
                        "structured": actual,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )

    total = metrics.aggregate_cards(list(cards.values()))
    total["errors"] = len(errors)
    if cards:
        total["transcribe_ms_median"] = round(statistics.median(transcribe_ms), 1)
        total["structure_ms_median"] = round(statistics.median(structure_ms), 1)
    usage = {
        "input_tokens": float(tokens["input"]),
        "output_tokens": float(tokens["output"]),
    }
    return total, errors, usage, cards


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--truth", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--provider", choices=("vertex", "fake"), default="vertex")
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0, help="先頭 N 枚だけ計測")
    parser.add_argument("--save-text", type=Path, default=None)
    parser.add_argument(
        "--price-in-per-mtok",
        type=float,
        default=None,
        help="入力 100 万トークン単価（USD）。未指定なら料金は出さない",
    )
    parser.add_argument("--price-out-per-mtok", type=float, default=None)
    parser.add_argument("--jpy-per-usd", type=float, default=None)
    parser.add_argument(
        "--price-per-card-jpy", type=float, default=DEFAULT_JPY_PER_CARD
    )
    args = parser.parse_args(argv)

    images = find_images(args.images)
    if args.limit > 0:
        images = images[: args.limit]
    if not images:
        print("画像が見つかりません", file=sys.stderr)
        return 2
    truth = load_truth(args.truth)
    provider = build_provider(args.provider)

    runs: list[dict[str, Any]] = []
    all_errors: list[dict[str, Any]] = []
    card_runs: list[dict[str, Any]] = []
    started_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    for index in range(args.runs):
        total, errors, usage, cards = run_once(provider, images, truth, args.save_text)
        all_errors.extend(errors)
        card_runs.append(cards)
        total["run"] = index + 1
        total["card_details"] = {
            stem: {
                "field_accuracy": card["field_accuracy"],
                "cer": card["cer"],
                "fabrication_count": card["fabrication_count"],
                "fabricated": card["fabricated"],
                "mismatched": [
                    field for field, ok in card["scalar_matches"].items() if not ok
                ]
                + [
                    f"contact:{field}"
                    for field, ok in card["contact_matches"].items()
                    if not ok
                ],
            }
            for stem, card in cards.items()
        }
        total["usage"] = {
            "input_tokens": int(usage["input_tokens"]),
            "output_tokens": int(usage["output_tokens"]),
        }
        if args.price_in_per_mtok is not None and args.price_out_per_mtok is not None:
            cost_usd = (
                usage["input_tokens"] / 1_000_000 * args.price_in_per_mtok
                + usage["output_tokens"] / 1_000_000 * args.price_out_per_mtok
            )
            total["usage"]["estimated_cost_usd"] = round(cost_usd, 6)
            if args.jpy_per_usd is not None:
                total["usage"]["estimated_cost_jpy"] = round(
                    cost_usd * args.jpy_per_usd, 4
                )
        runs.append(total)

    result = {
        "generated_at": started_at,
        "provider": provider.name,
        "model": getattr(provider, "model", None),
        "images": len(images),
        "runs": runs,
        "variance": {
            "field_accuracy": metrics.variance([run["field_accuracy"] for run in runs]),
            "char_accuracy": metrics.variance([run["char_accuracy"] for run in runs]),
            "cer": metrics.variance([run["cer"] for run in runs]),
        },
        "unstable_card_fields": metrics.unstable_fields(
            card_runs, [image.stem for image in images]
        ),
        "cost": {
            "price_per_card_jpy_assumption": args.price_per_card_jpy,
            "estimated_total_jpy": round(args.price_per_card_jpy * len(images), 4),
        },
        "errors": all_errors,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print_summary(result)
    if all_errors:
        print(f"エラー: {len(all_errors)} 件（{args.out} に記録）", file=sys.stderr)
        return 1
    return 0


def print_summary(result: dict[str, Any]) -> None:
    print(
        f"provider={result['provider']} model={result['model']} images={result['images']}"
    )
    header = "run\tfield_acc\tchar_acc\tCER\tfabricated\tcards"
    print(header)
    for run in result["runs"]:
        print(
            f"{run['run']}\t{run['field_accuracy']:.3f}\t{run['char_accuracy']:.3f}"
            f"\t{run['cer']:.4f}\t{run['fabrication_count']}\t{run['cards']}"
        )
    spread = result["variance"]
    print(
        "variance field_acc: "
        f"min={spread['field_accuracy']['min']} max={spread['field_accuracy']['max']} "
        f"stdev={spread['field_accuracy']['stdev']}"
    )


if __name__ == "__main__":
    raise SystemExit(main())
