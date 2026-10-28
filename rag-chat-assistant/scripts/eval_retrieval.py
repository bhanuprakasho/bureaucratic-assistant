#!/usr/bin/env python3
"""
Evaluate retrieval quality (Recall@1/3/5) against a hand-built test set.

A test case is a HIT when one of the top-k retrieved chunks comes from
the expected PDF file AND contains one of the case's `must_contain`
phrases (see src/retrieval/metrics.py). chunk_ids are deliberately not
used, so changing chunk size/overlap does not break the test set.

Cases are only scored when `"verified": true` and `must_contain` holds a
real phrase, so unfinished draft cases are skipped (and listed), never
silently counted as misses.

By default only the "tune" split is scored. Run `--split final` ONCE at
the very end, so the final number is not tuned against.

Usage:
    python scripts/eval_retrieval.py
    python scripts/eval_retrieval.py --also-unfiltered
    python scripts/eval_retrieval.py --split final
    python scripts/eval_retrieval.py --split all
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.processing.writer import read_chunks_jsonl
from src.retrieval.metrics import first_hit_rank, recall_at, text_contains_any
from src.retrieval.retriever import Retriever
from src.utils.logging_utils import configure_root_logging

DEFAULT_TEST_SET = config.PROJECT_ROOT / "evaluation" / "retrieval_test_set.json"
CUTOFFS = (1, 3, 5)
MAIN_K = max(CUTOFFS)
# Retrieve deeper than 5 so a miss can report "found at rank 12" instead
# of just "not in top 5".
DIAGNOSTIC_K = 50


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate retrieval Recall@k.")
    parser.add_argument("--test-set", type=Path, default=DEFAULT_TEST_SET)
    parser.add_argument("--chunks-path", type=Path, default=config.CHUNKS_OUTPUT_PATH,
                         help="chunks.jsonl, used to validate test cases and diagnose misses.")
    parser.add_argument("--split", choices=["tune", "final", "all"], default="tune")
    parser.add_argument("--also-unfiltered", action="store_true",
                         help="Also run every case WITHOUT the service filter, for comparison.")
    return parser.parse_args()


def load_cases(path: Path) -> list[dict]:
    with Path(path).open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("cases", [])


def is_scorable(case: dict) -> bool:
    phrases = case.get("must_contain") or []
    return (
        bool(case.get("verified"))
        and bool(case.get("expected_file"))
        and bool(phrases)
        and not any("todo" in str(p).lower() for p in phrases)
    )


def phrase_chunk_ids(records: list[dict], case: dict) -> list[str]:
    """chunk_ids in the expected file whose text contains a must_contain phrase."""
    return [
        r["chunk_id"] for r in records
        if r.get("service_name") == case["service"]
        and r.get("file_name") == case["expected_file"]
        and text_contains_any(r.get("text", ""), case["must_contain"])
    ]


def run_cases(retriever: Retriever, cases: list[dict], records: list[dict], use_filter: bool) -> list[dict]:
    outcomes = []
    for case in cases:
        service = case["service"] if use_filter else None
        results = retriever.retrieve(case["query"], k=DIAGNOSTIC_K, service=service)
        rank = first_hit_rank(results, case["expected_file"], case["must_contain"])

        outcome = {"case": case, "rank": rank, "top": results[:3], "diagnosis": None}
        if rank is None:
            ids = phrase_chunk_ids(records, case)
            if ids:
                outcome["diagnosis"] = (
                    f"phrase exists in {len(ids)} chunk(s) of the expected file "
                    f"(e.g. {ids[0]}) but none was retrieved in the top {DIAGNOSTIC_K} "
                    "-> ranking / query-wording problem"
                )
            else:
                outcome["diagnosis"] = (
                    "phrase is NOT in any chunk of the expected file "
                    "-> typo in the test case, or chunking split/cleaned the phrase (Step 3)"
                )
        outcomes.append(outcome)
    return outcomes


def _recall_line(outcomes: list[dict]) -> str:
    ranks = [o["rank"] for o in outcomes]
    parts = "  ".join(f"Recall@{n}={recall_at(ranks, n):.2f}" for n in CUTOFFS)
    return f"{parts}  (n={len(outcomes)})"


def print_report(title: str, outcomes: list[dict], show_cases: bool) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)

    if show_cases:
        for o in outcomes:
            c, rank = o["case"], o["rank"]
            if rank is None:
                status, rank_txt = "MISS", f"not in top {DIAGNOSTIC_K}"
            elif rank <= MAIN_K:
                status, rank_txt = "OK  ", f"rank {rank}"
            else:
                status, rank_txt = "MISS", f"rank {rank} (outside top {MAIN_K})"
            print(f"[{status}] {c['id']:<12} {rank_txt:<28} {c['query']}")
            if status == "MISS":
                if o["diagnosis"]:
                    print(f"         why: {o['diagnosis']}")
                for r in o["top"]:
                    print(f"         got: {r.service_name}/{r.file_name} "
                          f"p.{r.page_start}-{r.page_end} sim={r.similarity:.3f}")

    print("\nOverall:     " + _recall_line(outcomes))
    for label, key in (("By service", lambda o: o["case"]["service"]),
                       ("By split", lambda o: o["case"].get("split", "tune"))):
        groups: dict[str, list[dict]] = defaultdict(list)
        for o in outcomes:
            groups[key(o)].append(o)
        print(f"\n{label}:")
        for name in sorted(groups):
            print(f"  {name:<12} {_recall_line(groups[name])}")


def main() -> int:
    configure_root_logging(logging.WARNING)
    args = parse_args()

    try:
        cases = load_cases(args.test_set)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"\nCould not read test set {args.test_set}: {exc}")
        return 1

    try:
        records = list(read_chunks_jsonl(args.chunks_path))
    except FileNotFoundError as exc:
        print(f"\n{exc} -- run scripts/build_chunks.py first.")
        return 1
    known_pairs = {(r.get("service_name"), r.get("file_name")) for r in records}

    if args.split != "all":
        cases = [c for c in cases if c.get("split", "tune") == args.split]

    scorable, unfinished, invalid = [], [], []
    for case in cases:
        if not is_scorable(case):
            unfinished.append(case["id"])
        elif (case["service"], case["expected_file"]) not in known_pairs:
            invalid.append(case["id"])
        else:
            scorable.append(case)

    print(f"\nTest set: {args.test_set}")
    print(f"Split: {args.split}   cases: {len(cases)}   "
          f"scored: {len(scorable)}   unfinished: {len(unfinished)}   invalid: {len(invalid)}")
    if unfinished:
        print(f"  Unfinished (not verified / no phrase yet, skipped): {', '.join(unfinished)}")
    if invalid:
        print(f"  INVALID (service/expected_file not found in chunks.jsonl, skipped): {', '.join(invalid)}")
    if args.split in ("final", "all"):
        print("  Reminder: the 'final' split should be scored once, at the very end.")

    if not scorable:
        print("\nNothing to score. Fill in expected_file / must_contain and set "
              '"verified": true for your cases in the test set.')
        return 1

    try:
        retriever = Retriever.from_config()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"\n{exc}")
        return 1

    print_report("RETRIEVAL RESULTS - with service filter (frontend behaviour)",
                 run_cases(retriever, scorable, records, use_filter=True), show_cases=True)

    if args.also_unfiltered:
        print_report("RETRIEVAL RESULTS - NO service filter (search everything)",
                     run_cases(retriever, scorable, records, use_filter=False), show_cases=True)

    print("\n" + "=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
