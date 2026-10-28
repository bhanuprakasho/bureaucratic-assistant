#!/usr/bin/env python3
"""
Calibrate and evaluate the Step 6 scope / sufficiency thresholds.

Labelled queries come from evaluation/scope_test_set.json plus (by
default) every VERIFIED case in evaluation/retrieval_test_set.json, which
is imported as SUFFICIENT because a verified retrieval case already
proves the answer exists in the documents.

Labels (relative to the documents of the service the user picked):
  SUFFICIENT    the documents answer the question
  INSUFFICIENT  the topic is covered, but this specific detail is not
  OUT_OF_SCOPE  the documents have nothing to do with the question

Only cases with "verified": true are used. By default only the "tune"
split is used; score the "final" split once, at the very end, with
--evaluate --split final.

Usage:
    python scripts/calibrate_scope.py                         # sweep + report (saves nothing)
    python scripts/calibrate_scope.py --save                  # sweep + write data/scope_thresholds.json
    python scripts/calibrate_scope.py --evaluate              # score the SAVED thresholds (tune split)
    python scripts/calibrate_scope.py --evaluate --split final
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.retrieval.retriever import DEFAULT_TOP_K, Retriever
from src.scope.calibration import (
    LABELS,
    MIN_RECOMMENDED_PER_LABEL,
    CaseFeatures,
    EvalSummary,
    calibrate,
    cases_from_retrieval_set,
    count_labels,
    evaluate,
    validate_case,
)
from src.scope.sufficiency import (
    DEFAULT_THRESHOLDS_PATH,
    ScopeThresholds,
    check_scope,
    load_thresholds,
    save_thresholds,
)
from src.utils.logging_utils import configure_root_logging

DEFAULT_SCOPE_SET = config.PROJECT_ROOT / "evaluation" / "scope_test_set.json"
DEFAULT_RETRIEVAL_SET = config.PROJECT_ROOT / "evaluation" / "retrieval_test_set.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calibrate / evaluate scope & sufficiency thresholds.")
    parser.add_argument("--scope-test-set", type=Path, default=DEFAULT_SCOPE_SET)
    parser.add_argument("--retrieval-test-set", type=Path, default=DEFAULT_RETRIEVAL_SET)
    parser.add_argument("--no-retrieval-cases", action="store_true",
                         help="Do not import verified retrieval cases as SUFFICIENT.")
    parser.add_argument("--split", choices=["tune", "final", "all"], default="tune")
    parser.add_argument("--evaluate", action="store_true",
                         help="Score the saved thresholds instead of calibrating.")
    parser.add_argument("--save", action="store_true",
                         help="Write the recommended thresholds to disk (calibration mode only).")
    parser.add_argument("--thresholds-path", type=Path, default=DEFAULT_THRESHOLDS_PATH)
    parser.add_argument("-k", "--top-k", type=int, default=DEFAULT_TOP_K)
    return parser.parse_args()


# --- Loading ------------------------------------------------------------------------------

def _read_json(path: Path) -> dict:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def load_cases(args: argparse.Namespace) -> list[dict]:
    cases = list(_read_json(args.scope_test_set).get("cases", []))
    if not args.no_retrieval_cases:
        if Path(args.retrieval_test_set).exists():
            cases.extend(cases_from_retrieval_set(_read_json(args.retrieval_test_set).get("cases", [])))
        else:
            print(f"Note: {args.retrieval_test_set} not found; no retrieval cases imported.")
    return cases


# --- Printing --------------------------------------------------------------------------------

def print_confusion(summary: EvalSummary) -> None:
    print("\nConfusion matrix (rows = truth, columns = predicted):")
    print(f"  {'':<14}" + "".join(f"{p:>15}" for p in LABELS))
    for truth in LABELS:
        print(f"  {truth:<14}" + "".join(f"{summary.confusion[truth][p]:>15}" for p in LABELS))


def print_summary(summary: EvalSummary) -> None:
    print(f"\nCases: {summary.n}   correct: {summary.correct}   accuracy: {summary.accuracy:.2f}   "
          f"weighted cost: {summary.total_cost:g}")
    print(f"Dangerous errors (answered when it should NOT have): {summary.dangerous_errors}")
    print(f"False refusals (refused an answerable query):        {summary.false_refusals}")
    print_confusion(summary)


def print_score_stats(features: list[CaseFeatures]) -> None:
    print("\nBest similarity per label (this is what the thresholds must separate):")
    for label in LABELS:
        tops = [max(f.similarities) if f.similarities else 0.0 for f in features if f.label == label]
        if tops:
            print(f"  {label:<14} n={len(tops):<3} min={min(tops):.2f}  "
                  f"median={statistics.median(tops):.2f}  max={max(tops):.2f}")


# --- Main ---------------------------------------------------------------------------------------

def main() -> int:
    configure_root_logging(logging.WARNING)
    args = parse_args()

    try:
        all_cases = load_cases(args)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"\nCould not read a test set: {exc}")
        return 1

    if args.split != "all":
        all_cases = [c for c in all_cases if c.get("split", "tune") == args.split]

    usable, unverified, invalid = [], [], []
    for case in all_cases:
        problem = validate_case(case)
        if problem:
            invalid.append(f"{case.get('id', '?')} ({problem})")
        elif not case.get("verified"):
            unverified.append(case["id"])
        else:
            usable.append(case)

    print(f"\nSplit: {args.split}   cases: {len(all_cases)}   usable: {len(usable)}   "
          f"unverified (skipped): {len(unverified)}   invalid (skipped): {len(invalid)}")
    if unverified:
        print(f"  Unverified: {', '.join(unverified)}")
    for item in invalid:
        print(f"  INVALID: {item}")
    if args.split in ("final", "all"):
        print("  Reminder: the 'final' split should be scored once, at the very end.")

    try:
        retriever = Retriever.from_config()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"\n{exc}")
        return 1

    # ---- evaluate saved thresholds -------------------------------------------------------------
    if args.evaluate:
        return evaluate_saved(args, retriever, usable)

    # ---- calibrate ----------------------------------------------------------------------------------
    features: list[CaseFeatures] = []
    for case in usable:
        try:
            chunks = retriever.retrieve(case["query"], k=args.top_k, service=case.get("service"))
        except ValueError as exc:
            print(f"  INVALID: {case['id']} ({exc})")
            continue
        features.append(CaseFeatures(case["id"], case["label"], tuple(c.similarity for c in chunks)))

    counts = count_labels(features)
    print("\nLabelled cases used: " + ", ".join(f"{label}={counts[label]}" for label in LABELS))
    missing = [label for label in LABELS if counts[label] == 0]
    if missing:
        print(f"\nCannot calibrate: no verified cases for {', '.join(missing)}. "
              "Verify more cases in evaluation/scope_test_set.json / retrieval_test_set.json.")
        return 1
    small = [label for label in LABELS if counts[label] < MIN_RECOMMENDED_PER_LABEL]
    if small:
        print(f"  Warning: fewer than {MIN_RECOMMENDED_PER_LABEL} cases for {', '.join(small)} -- "
              "treat the thresholds as rough and say so in your report.")

    print_score_stats(features)

    result = calibrate(features)
    t = result.thresholds
    print("\n" + "=" * 70)
    print("RECOMMENDED THRESHOLDS")
    print("=" * 70)
    print(f"  oos_threshold         {t.oos_threshold:.3f}   best match below this -> OUT_OF_SCOPE")
    print(f"  sufficient_threshold  {t.sufficient_threshold:.3f}   best match needed for SUFFICIENT")
    print(f"  support_floor         {t.support_floor:.3f}   a chunk 'supports' the answer at/above this")
    print(f"  min_support           {t.min_support}       supporting chunks needed for SUFFICIENT")
    print(f"  switch_margin         {t.switch_margin:.3f}   (not calibrated; edit by hand if needed)")
    print(f"\n  {result.tied_optimal} threshold combination(s) were equally good; "
          "the most central one was chosen.")

    print_summary(result.summary)
    if result.summary.wrong_case_ids:
        print("\nStill misclassified: " + ", ".join(result.summary.wrong_case_ids))
        print("  (Check these labels first -- a wrong label is more likely than an unlearnable query.)")

    baseline = evaluate(features, ScopeThresholds())
    print(f"\nFor comparison, the un-calibrated defaults score: accuracy {baseline.accuracy:.2f}, "
          f"weighted cost {baseline.total_cost:g}, dangerous errors {baseline.dangerous_errors}.")

    if args.save:
        path = save_thresholds(t, args.thresholds_path, {
            "split": args.split,
            "n_cases": len(features),
            "label_counts": counts,
            "accuracy": round(result.summary.accuracy, 4),
            "weighted_cost": result.summary.total_cost,
            "tied_optimal_combinations": result.tied_optimal,
        })
        print(f"\nSaved thresholds to {path}")
    else:
        print("\nNothing saved. Re-run with --save to write these thresholds.")
    print("=" * 70)
    return 0


def evaluate_saved(args: argparse.Namespace, retriever: Retriever, usable: list[dict]) -> int:
    if not usable:
        print("\nNothing to evaluate.")
        return 1
    try:
        thresholds, source = load_thresholds(args.thresholds_path)
    except ValueError as exc:
        print(f"\n{exc}")
        return 1
    print(f"\nThresholds: {thresholds.to_dict()}")
    print(f"Source:     {source}")

    features: list[CaseFeatures] = []
    suggestion_total = suggestion_ok = unexpected = 0

    print("\n" + "-" * 70)
    for case in usable:
        try:
            result, chunks = check_scope(
                retriever, case["query"], service=case.get("service"),
                k=args.top_k, thresholds=thresholds,
            )
        except ValueError as exc:
            print(f"INVALID: {case['id']} ({exc})")
            continue

        sims = tuple(c.similarity for c in chunks)
        features.append(CaseFeatures(case["id"], case["label"], sims))

        ok = result.verdict.value == case["label"]
        top = f"{result.top_similarity:.2f}" if result.top_similarity is not None else "n/a"
        suggest = f" suggest={result.suggested_service}" if result.suggested_service else ""
        print(f"[{'OK  ' if ok else 'MISS'}] {case['id']:<16} truth={case['label']:<13} "
              f"pred={result.verdict.value:<13} top={top} support={result.supporting_chunks}{suggest}")
        if not ok:
            print(f"       why: {result.reason}")
            print(f"       query: {case['query']}")

        expected = (case.get("expected_suggestion") or "").lower() or None
        got = (result.suggested_service or "").lower() or None
        if expected:
            suggestion_total += 1
            suggestion_ok += expected == got
            if expected != got:
                print(f"       service switch: expected {expected!r}, got {got!r}")
        elif got:
            unexpected += 1
            print(f"       unexpected service-switch suggestion: {got!r}")

    if not features:
        print("\nNo cases could be evaluated.")
        return 1

    print("-" * 70)
    print_summary(evaluate(features, thresholds))
    if suggestion_total or unexpected:
        print(f"\nService-switch suggestions: {suggestion_ok}/{suggestion_total} expected ones found; "
              f"{unexpected} unexpected suggestion(s) on other cases.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
