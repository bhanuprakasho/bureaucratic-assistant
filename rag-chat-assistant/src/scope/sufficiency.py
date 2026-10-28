"""
Step 6 - Scope and sufficiency detection.

Implements the rule  "NO SUPPORTING INFORMATION -> NO UNSUPPORTED ANSWER"
as actual logic. Given the chunks returned by Step 5, decide whether the
knowledge base can support an answer:

    SUFFICIENT    -> strong, well-supported match: later steps may answer.
    INSUFFICIENT  -> topically related, but not confident enough to answer.
    OUT_OF_SCOPE  -> nothing in the searched scope is close to the query.

Decision rule (see `decide`)
----------------------------
Let `top` be the best similarity and `supporting` the number of retrieved
chunks whose similarity is >= `support_floor`:

    top <  oos_threshold                                  -> OUT_OF_SCOPE
    top <  sufficient_threshold                           -> INSUFFICIENT
    supporting < min_support                              -> INSUFFICIENT
    otherwise                                             -> SUFFICIENT

The implementation guide's "margin between the top two chunks" signal is
deliberately NOT used: neighbouring chunks overlap by design, so several
genuinely relevant chunks score almost the same, which would make a good
query look "ambiguous".

Service switching
-----------------
In the frontend the user picks a service first. `check_scope` therefore
also searches ALL services (one extra search per query). If a different
service matches clearly better than the chosen one, the result carries
`suggested_service` so the UI can say "this looks like an Aadhaar
question - switch service?". The verdict itself always describes the
CHOSEN service's documents; the suggestion is extra information.

Thresholds
----------
Thresholds are data, not constants: `scripts/calibrate_scope.py` finds
them from a labelled query set and saves them to
`data/scope_thresholds.json` (override with RAG_SCOPE_THRESHOLDS). If the
file does not exist, un-calibrated defaults are used and a warning is
logged. Re-calibrate whenever documents are added/removed or the
embedding model changes -- score distributions shift.

No LLM is involved here, and this module never produces user-facing
wording; that belongs to the later interface step.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, fields, replace
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Sequence

import config
from src.retrieval.retriever import DEFAULT_TOP_K, RetrievedChunk, Retriever
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

DEFAULT_THRESHOLDS_PATH: Path = Path(
    os.environ.get("RAG_SCOPE_THRESHOLDS", config.PROJECT_ROOT / "data" / "scope_thresholds.json")
)

DEFAULTS_SOURCE = "defaults (not calibrated)"


class Verdict(str, Enum):
    SUFFICIENT = "SUFFICIENT"
    INSUFFICIENT = "INSUFFICIENT"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"


# --- Thresholds ----------------------------------------------------------------

@dataclass(frozen=True)
class ScopeThresholds:
    """Decision thresholds. The defaults are un-calibrated starting
    points, NOT validated values -- run scripts/calibrate_scope.py."""

    oos_threshold: float = 0.35         # best similarity below this -> OUT_OF_SCOPE
    sufficient_threshold: float = 0.55  # best similarity needed for SUFFICIENT
    support_floor: float = 0.45         # a chunk "supports" the answer at/above this
    min_support: int = 2                # supporting chunks needed for SUFFICIENT
    switch_margin: float = 0.10         # other service must beat chosen one by this much

    def __post_init__(self) -> None:
        if self.oos_threshold > self.sufficient_threshold:
            raise ValueError(
                "oos_threshold must not be greater than sufficient_threshold "
                f"(got {self.oos_threshold} > {self.sufficient_threshold})."
            )
        if isinstance(self.min_support, bool) or not isinstance(self.min_support, int) or self.min_support < 1:
            raise ValueError(f"min_support must be an integer >= 1 (got {self.min_support!r}).")
        if self.switch_margin < 0:
            raise ValueError(f"switch_margin must be >= 0 (got {self.switch_margin}).")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# (mtime, thresholds) per path, so a long-lived frontend does not re-read
# the file on every query but still picks up a re-calibration.
_threshold_cache: dict[Path, tuple[float, ScopeThresholds]] = {}
_warned_defaults = False


def load_thresholds(path: Optional[Path] = None) -> tuple[ScopeThresholds, str]:
    """Load calibrated thresholds. Returns (thresholds, source_description).

    A missing file is not an error: defaults are returned (with a one-time
    warning). A present-but-invalid file raises ValueError -- silently
    falling back to defaults there would hide a real mistake.
    """
    global _warned_defaults
    path = Path(path or DEFAULT_THRESHOLDS_PATH)

    if not path.exists():
        if not _warned_defaults:
            logger.warning(
                "No calibrated thresholds at %s -- using un-calibrated defaults. "
                "Run scripts/calibrate_scope.py --save.", path,
            )
            _warned_defaults = True
        return ScopeThresholds(), DEFAULTS_SOURCE

    mtime = path.stat().st_mtime
    cached = _threshold_cache.get(path)
    if cached and cached[0] == mtime:
        return cached[1], str(path)

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read thresholds file {path}: {exc}") from exc

    values = data.get("thresholds", data) if isinstance(data, dict) else None
    if not isinstance(values, dict):
        raise ValueError(f"Thresholds file {path} must contain a JSON object.")

    known = {f.name for f in fields(ScopeThresholds)}
    unknown = set(values) - known
    if unknown:
        raise ValueError(f"Unknown threshold key(s) in {path}: {sorted(unknown)}")

    thresholds = ScopeThresholds(**values)
    _threshold_cache[path] = (mtime, thresholds)
    return thresholds, str(path)


def save_thresholds(
    thresholds: ScopeThresholds,
    path: Optional[Path] = None,
    calibration_info: Optional[dict[str, Any]] = None,
) -> Path:
    """Write thresholds (plus how they were calibrated) to JSON."""
    path = Path(path or DEFAULT_THRESHOLDS_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "thresholds": thresholds.to_dict(),
        "calibration": {
            "saved_on": date.today().isoformat(),
            "embedding_model": config.EMBEDDING_MODEL_NAME,
            **(calibration_info or {}),
        },
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    _threshold_cache.pop(path, None)
    return path


# --- The decision rule -----------------------------------------------------------

def decide(similarities: Sequence[float], thresholds: ScopeThresholds) -> tuple[Verdict, str, int]:
    """Pure decision rule over a list of similarity scores.

    Returns (verdict, reason, supporting_chunk_count). This single
    function is used both at query time and by the calibration script, so
    what gets calibrated is exactly what runs in production.
    """
    if not similarities:
        return Verdict.OUT_OF_SCOPE, "No chunks were retrieved.", 0

    top = max(similarities)
    supporting = sum(1 for s in similarities if s >= thresholds.support_floor)

    if top < thresholds.oos_threshold:
        return (
            Verdict.OUT_OF_SCOPE,
            f"Best match {top:.2f} is below the out-of-scope threshold {thresholds.oos_threshold:.2f}.",
            supporting,
        )
    if top < thresholds.sufficient_threshold:
        return (
            Verdict.INSUFFICIENT,
            f"Best match {top:.2f} is related but below the sufficiency threshold "
            f"{thresholds.sufficient_threshold:.2f}.",
            supporting,
        )
    if supporting < thresholds.min_support:
        return (
            Verdict.INSUFFICIENT,
            f"Best match {top:.2f} is strong but only {supporting} chunk(s) reach "
            f"{thresholds.support_floor:.2f}; {thresholds.min_support} needed.",
            supporting,
        )
    return (
        Verdict.SUFFICIENT,
        f"Best match {top:.2f} and {supporting} chunk(s) at or above "
        f"{thresholds.support_floor:.2f} (needs {thresholds.min_support}).",
        supporting,
    )


# --- Results ------------------------------------------------------------------------

@dataclass(frozen=True)
class SufficiencyResult:
    """Outcome of the scope/sufficiency check. Developer-facing `reason`;
    user-facing wording is the interface step's job."""

    verdict: Verdict
    reason: str
    top_similarity: Optional[float]
    supporting_chunks: int
    chunks_considered: int
    thresholds_source: str
    service: Optional[str] = None                      # service that was searched (None = all)
    suggested_service: Optional[str] = None            # another service that fits better
    suggested_service_similarity: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["verdict"] = self.verdict.value
        return data


def check_sufficiency(
    results: Sequence[RetrievedChunk],
    thresholds: Optional[ScopeThresholds] = None,
    thresholds_source: Optional[str] = None,
) -> SufficiencyResult:
    """Decide whether `results` (from Step 5's retrieve) can support an answer.

    Runs before any LLM call: refusing here structurally prevents the
    generator from ever being asked to answer without grounding.
    """
    if thresholds is None:
        thresholds, thresholds_source = load_thresholds()
    elif thresholds_source is None:
        thresholds_source = "provided explicitly"

    sims = [r.similarity for r in results]
    verdict, reason, supporting = decide(sims, thresholds)
    return SufficiencyResult(
        verdict=verdict,
        reason=reason,
        top_similarity=max(sims) if sims else None,
        supporting_chunks=supporting,
        chunks_considered=len(sims),
        thresholds_source=thresholds_source,
    )


def _suggest_switch(
    chosen_service: str,
    chosen_results: Sequence[RetrievedChunk],
    all_results: Sequence[RetrievedChunk],
    thresholds: ScopeThresholds,
) -> Optional[tuple[str, float]]:
    """Return (other_service, similarity) if another service clearly fits
    the query better than the chosen one, else None."""
    if not all_results:
        return None
    best = all_results[0]
    if not best.service_name or best.service_name.lower() == chosen_service.lower():
        return None
    if best.similarity < thresholds.oos_threshold:
        return None                      # not even relevant to that service
    chosen_top = max((r.similarity for r in chosen_results), default=0.0)
    if best.similarity - chosen_top < thresholds.switch_margin:
        return None                      # not clearly better
    return best.service_name, best.similarity


def check_scope(
    retriever: Retriever,
    query: str,
    service: Optional[str] = None,
    k: int = DEFAULT_TOP_K,
    thresholds: Optional[ScopeThresholds] = None,
) -> tuple[SufficiencyResult, list[RetrievedChunk]]:
    """Retrieve for `query` and decide whether the knowledge base can answer.

    Returns (result, chunks). `chunks` are the chunks retrieved within the
    chosen service (or all services if none was chosen), ready to be reused
    by the reasoning / generation steps so nothing has to be retrieved twice.

    If a service is chosen, ALL services are also searched once, and
    `result.suggested_service` is set when another service matches clearly
    better. Raises ValueError for an empty/overlong query or unknown service
    (propagated from the retriever).
    """
    if thresholds is None:
        thresholds, source = load_thresholds()
    else:
        source = "provided explicitly"

    chunks = retriever.retrieve(query, k=k, service=service)
    result = check_sufficiency(chunks, thresholds, source)

    chosen = (service or "").strip()
    if not chosen:
        return result, chunks

    canonical = next(
        (s for s in retriever.available_services() if s.lower() == chosen.lower()), chosen
    )
    all_chunks = retriever.retrieve(query, k=k, service=None)
    suggestion = _suggest_switch(canonical, chunks, all_chunks, thresholds)

    result = replace(
        result,
        service=canonical,
        suggested_service=suggestion[0] if suggestion else None,
        suggested_service_similarity=suggestion[1] if suggestion else None,
    )
    return result, chunks
