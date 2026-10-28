"""
Step 6 - Threshold calibration (pure logic, no model or vector store).

Given labelled queries whose similarity scores have already been
computed, find the thresholds that best separate SUFFICIENT /
INSUFFICIENT / OUT_OF_SCOPE.

Cost-weighted, not plain accuracy
---------------------------------
The costliest mistake in a bureaucratic assistant is answering when the
knowledge base cannot support an answer (a false SUFFICIENT is the
direct precursor of a hallucinated rule). Errors are therefore weighted:

    truth \\ predicted    SUFFICIENT  INSUFFICIENT  OUT_OF_SCOPE
    SUFFICIENT                0           1             1       (needless refusal)
    INSUFFICIENT              3           0             1
    OUT_OF_SCOPE              3           1             0

The sweep minimises total cost, then maximises plain accuracy. Many
threshold combinations usually tie, so among the tied best the one
closest to the centre of the tied region is chosen: it sits in the
middle of a flat, safe region rather than on the edge of a cliff.

With a small hand-labelled set the result is only as reliable as the
set. Report the sample size honestly and keep a held-out split.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Any, Iterator, Optional, Sequence

from src.scope.sufficiency import ScopeThresholds, Verdict, decide

LABELS: tuple[str, ...] = (
    Verdict.SUFFICIENT.value,
    Verdict.INSUFFICIENT.value,
    Verdict.OUT_OF_SCOPE.value,
)

# COST[truth][predicted]
COST: dict[str, dict[str, float]] = {
    "SUFFICIENT":   {"SUFFICIENT": 0, "INSUFFICIENT": 1, "OUT_OF_SCOPE": 1},
    "INSUFFICIENT": {"SUFFICIENT": 3, "INSUFFICIENT": 0, "OUT_OF_SCOPE": 1},
    "OUT_OF_SCOPE": {"SUFFICIENT": 3, "INSUFFICIENT": 1, "OUT_OF_SCOPE": 0},
}

# Below this many cases for any label, warn that calibration is shaky.
MIN_RECOMMENDED_PER_LABEL = 5


def _frange(start: float, stop: float, step: float) -> list[float]:
    values, i = [], 0
    while True:
        v = round(start + i * step, 3)
        if v > stop + 1e-9:
            return values
        values.append(v)
        i += 1


OOS_GRID = _frange(0.20, 0.60, 0.025)
SUFFICIENT_GRID = _frange(0.40, 0.85, 0.025)
FLOOR_GRID = _frange(0.30, 0.75, 0.05)
MIN_SUPPORT_GRID = (1, 2, 3)

_SWEPT_KEYS = ("oos_threshold", "sufficient_threshold", "support_floor", "min_support")
_SPANS = {
    "oos_threshold": OOS_GRID[-1] - OOS_GRID[0],
    "sufficient_threshold": SUFFICIENT_GRID[-1] - SUFFICIENT_GRID[0],
    "support_floor": FLOOR_GRID[-1] - FLOOR_GRID[0],
    "min_support": float(max(MIN_SUPPORT_GRID) - min(MIN_SUPPORT_GRID)),
}


# --- Labelled cases ------------------------------------------------------------------

def validate_case(case: dict[str, Any]) -> Optional[str]:
    """Return a problem description, or None if the case is usable."""
    if not case.get("id"):
        return "missing id"
    if not str(case.get("query", "")).strip():
        return "missing query"
    if case.get("label") not in LABELS:
        return f"label must be one of {LABELS} (got {case.get('label')!r})"
    return None


def cases_from_retrieval_set(retrieval_cases: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn verified retrieval-test cases into SUFFICIENT scope cases.

    A verified retrieval case already proves the answer exists in the
    expected PDF, so its query is by definition answerable.
    """
    imported = []
    for c in retrieval_cases:
        phrases = c.get("must_contain") or []
        if not (
            c.get("verified")
            and c.get("expected_file")
            and phrases
            and not any("todo" in str(p).lower() for p in phrases)
        ):
            continue
        imported.append({
            "id": f"ret:{c['id']}",
            "split": c.get("split", "tune"),
            "service": c.get("service"),
            "query": c["query"],
            "label": Verdict.SUFFICIENT.value,
            "verified": True,
        })
    return imported


@dataclass(frozen=True)
class CaseFeatures:
    """What calibration needs from one labelled query."""

    case_id: str
    label: str
    similarities: tuple[float, ...]


# --- Evaluation -------------------------------------------------------------------------

@dataclass
class EvalSummary:
    n: int
    correct: int
    total_cost: float
    confusion: dict[str, dict[str, int]]          # truth -> predicted -> count
    dangerous_errors: int                          # answered when it should not have
    false_refusals: int                            # refused an answerable query
    wrong_case_ids: list[str] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.n if self.n else 0.0


def evaluate(features: Sequence[CaseFeatures], thresholds: ScopeThresholds) -> EvalSummary:
    confusion = {t: {p: 0 for p in LABELS} for t in LABELS}
    correct = dangerous = refusals = 0
    cost = 0.0
    wrong: list[str] = []

    for f in features:
        predicted = decide(f.similarities, thresholds)[0].value
        confusion[f.label][predicted] += 1
        cost += COST[f.label][predicted]
        if predicted == f.label:
            correct += 1
        else:
            wrong.append(f.case_id)
            if predicted == "SUFFICIENT":
                dangerous += 1
            elif f.label == "SUFFICIENT":
                refusals += 1

    return EvalSummary(
        n=len(features), correct=correct, total_cost=cost, confusion=confusion,
        dangerous_errors=dangerous, false_refusals=refusals, wrong_case_ids=wrong,
    )


def _fast_score(features: Sequence[CaseFeatures], thresholds: ScopeThresholds) -> tuple[float, int]:
    cost, correct = 0.0, 0
    for f in features:
        predicted = decide(f.similarities, thresholds)[0].value
        cost += COST[f.label][predicted]
        correct += predicted == f.label
    return cost, correct


# --- Sweep -----------------------------------------------------------------------------------

def iter_threshold_grid(switch_margin: float = ScopeThresholds().switch_margin) -> Iterator[ScopeThresholds]:
    """All valid combinations (oos <= sufficient) over the sweep grids."""
    for oos in OOS_GRID:
        for suff in SUFFICIENT_GRID:
            if oos > suff:
                continue
            for floor in FLOOR_GRID:
                for min_support in MIN_SUPPORT_GRID:
                    yield ScopeThresholds(
                        oos_threshold=oos,
                        sufficient_threshold=suff,
                        support_floor=floor,
                        min_support=min_support,
                        switch_margin=switch_margin,
                    )


def _pick_central(candidates: Sequence[ScopeThresholds]) -> ScopeThresholds:
    """Among equally good candidates, pick the one nearest their centre."""
    means = {k: mean(getattr(c, k) for c in candidates) for k in _SWEPT_KEYS}

    def sort_key(c: ScopeThresholds):
        dist = sum(((getattr(c, k) - means[k]) / _SPANS[k]) ** 2 for k in _SWEPT_KEYS)
        return (round(dist, 12), tuple(getattr(c, k) for k in _SWEPT_KEYS))

    return min(candidates, key=sort_key)


@dataclass
class CalibrationResult:
    thresholds: ScopeThresholds
    summary: EvalSummary
    tied_optimal: int                  # how many combinations were equally best
    label_counts: dict[str, int]


def count_labels(features: Sequence[CaseFeatures]) -> dict[str, int]:
    counts = {label: 0 for label in LABELS}
    for f in features:
        counts[f.label] += 1
    return counts


def calibrate(
    features: Sequence[CaseFeatures],
    switch_margin: float = ScopeThresholds().switch_margin,
) -> CalibrationResult:
    """Sweep the grid and return the best thresholds for these cases."""
    if not features:
        raise ValueError("No labelled cases to calibrate on.")

    best_key: Optional[tuple[float, int]] = None
    best: list[ScopeThresholds] = []
    for thresholds in iter_threshold_grid(switch_margin):
        cost, correct = _fast_score(features, thresholds)
        key = (cost, -correct)
        if best_key is None or key < best_key:
            best_key, best = key, [thresholds]
        elif key == best_key:
            best.append(thresholds)

    chosen = _pick_central(best)
    return CalibrationResult(
        thresholds=chosen,
        summary=evaluate(features, chosen),
        tied_optimal=len(best),
        label_counts=count_labels(features),
    )
