"""Tests for src/scope/calibration.py (pure logic, no I/O)."""

from __future__ import annotations

import pytest

from src.scope.calibration import (
    COST,
    LABELS,
    CaseFeatures,
    calibrate,
    cases_from_retrieval_set,
    count_labels,
    evaluate,
    iter_threshold_grid,
    validate_case,
)
from src.scope.sufficiency import ScopeThresholds


def _features():
    """Cleanly separable toy data."""
    suff = [CaseFeatures(f"s{i}", "SUFFICIENT", (0.80 - i * 0.02, 0.72, 0.66, 0.5, 0.4)) for i in range(4)]
    insuff = [CaseFeatures(f"i{i}", "INSUFFICIENT", (0.50 - i * 0.02, 0.45, 0.40, 0.3, 0.2)) for i in range(4)]
    oos = [CaseFeatures(f"o{i}", "OUT_OF_SCOPE", (0.20 - i * 0.02, 0.15, 0.1, 0.05, 0.0)) for i in range(4)]
    return suff + insuff + oos


# --- cost matrix --------------------------------------------------------------------

def test_answering_when_you_should_not_costs_more_than_refusing_needlessly():
    assert COST["OUT_OF_SCOPE"]["SUFFICIENT"] > COST["SUFFICIENT"]["OUT_OF_SCOPE"]
    assert COST["INSUFFICIENT"]["SUFFICIENT"] > COST["SUFFICIENT"]["INSUFFICIENT"]


def test_correct_predictions_cost_nothing():
    assert all(COST[label][label] == 0 for label in LABELS)


# --- evaluate ---------------------------------------------------------------------------

def test_evaluate_counts_errors_and_confusion():
    t = ScopeThresholds(oos_threshold=0.3, sufficient_threshold=0.6, support_floor=0.5, min_support=2)
    features = [
        CaseFeatures("good", "SUFFICIENT", (0.8, 0.7)),
        CaseFeatures("dangerous", "OUT_OF_SCOPE", (0.8, 0.7)),     # answered when it should not
        CaseFeatures("refused", "SUFFICIENT", (0.1,)),             # needlessly refused
    ]
    s = evaluate(features, t)
    assert (s.n, s.correct) == (3, 1)
    assert s.dangerous_errors == 1
    assert s.false_refusals == 1
    assert s.total_cost == COST["OUT_OF_SCOPE"]["SUFFICIENT"] + COST["SUFFICIENT"]["OUT_OF_SCOPE"]
    assert s.confusion["OUT_OF_SCOPE"]["SUFFICIENT"] == 1
    assert s.wrong_case_ids == ["dangerous", "refused"]


# --- grid ----------------------------------------------------------------------------------

def test_grid_only_contains_valid_threshold_combinations():
    grid = list(iter_threshold_grid())
    assert len(grid) > 1000
    assert all(t.oos_threshold <= t.sufficient_threshold for t in grid)


# --- calibrate --------------------------------------------------------------------------------

def test_calibrate_finds_perfect_thresholds_on_separable_data():
    result = calibrate(_features())
    assert result.summary.total_cost == 0
    assert result.summary.accuracy == 1.0
    assert result.tied_optimal > 1
    # sanity: the chosen thresholds really do classify the data correctly
    assert evaluate(_features(), result.thresholds).correct == 12


def test_calibrate_is_deterministic():
    assert calibrate(_features()).thresholds == calibrate(_features()).thresholds


def test_calibrate_prefers_no_dangerous_errors_when_data_overlaps():
    features = _features() + [CaseFeatures("hard", "OUT_OF_SCOPE", (0.78, 0.70, 0.6, 0.5, 0.4))]
    result = calibrate(features)
    # Misclassifying the single hard case as SUFFICIENT costs 3; the sweep
    # should rather give up the cheaper-to-lose cases than answer it.
    assert result.summary.dangerous_errors == 0


def test_calibrate_with_no_cases_raises():
    with pytest.raises(ValueError):
        calibrate([])


def test_count_labels():
    counts = count_labels(_features())
    assert counts == {"SUFFICIENT": 4, "INSUFFICIENT": 4, "OUT_OF_SCOPE": 4}


# --- case handling -------------------------------------------------------------------------------

def test_validate_case():
    ok = {"id": "x", "query": "q", "label": "SUFFICIENT"}
    assert validate_case(ok) is None
    assert validate_case({**ok, "label": "MAYBE"}) is not None
    assert validate_case({**ok, "query": "  "}) is not None
    assert validate_case({"query": "q", "label": "SUFFICIENT"}) is not None


def test_only_verified_complete_retrieval_cases_are_imported_as_sufficient():
    retrieval_cases = [
        {"id": "p-01", "split": "tune", "service": "passport", "query": "q1",
         "expected_file": "a.pdf", "must_contain": ["phrase"], "verified": True},
        {"id": "p-02", "service": "passport", "query": "q2",
         "expected_file": "a.pdf", "must_contain": ["TODO"], "verified": False},
        {"id": "p-03", "service": "passport", "query": "q3",
         "expected_file": "a.pdf", "must_contain": ["TODO"], "verified": True},   # verified but unfinished
    ]
    imported = cases_from_retrieval_set(retrieval_cases)
    assert [c["id"] for c in imported] == ["ret:p-01"]
    assert imported[0]["label"] == "SUFFICIENT"
    assert imported[0]["service"] == "passport"
    assert imported[0]["split"] == "tune"
