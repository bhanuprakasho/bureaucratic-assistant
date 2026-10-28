"""
Tests for src/scope/sufficiency.py.

Pure logic plus a fake retriever -- no model download, no vector store.
"""

from __future__ import annotations

import json

import pytest

from src.retrieval.retriever import RetrievedChunk
from src.scope.sufficiency import (
    DEFAULTS_SOURCE,
    ScopeThresholds,
    Verdict,
    check_scope,
    check_sufficiency,
    decide,
    load_thresholds,
    save_thresholds,
)

# Easy-to-read thresholds for the tests below.
T = ScopeThresholds(
    oos_threshold=0.30,
    sufficient_threshold=0.60,
    support_floor=0.50,
    min_support=2,
    switch_margin=0.10,
)


def _chunk(similarity, service="passport", chunk_id="c1"):
    return RetrievedChunk(
        chunk_id=chunk_id, text="t", similarity=similarity,
        distance=1 - similarity, service_name=service,
    )


# --- decide() ---------------------------------------------------------------------

def test_no_chunks_is_out_of_scope():
    verdict, _, supporting = decide([], T)
    assert verdict is Verdict.OUT_OF_SCOPE and supporting == 0


def test_low_best_match_is_out_of_scope():
    assert decide([0.29, 0.20], T)[0] is Verdict.OUT_OF_SCOPE


def test_related_but_weak_is_insufficient():
    assert decide([0.45, 0.40], T)[0] is Verdict.INSUFFICIENT


def test_strong_top_but_too_little_support_is_insufficient():
    # top is high enough, but only ONE chunk reaches the support floor
    verdict, reason, supporting = decide([0.80, 0.40, 0.35], T)
    assert verdict is Verdict.INSUFFICIENT
    assert supporting == 1
    assert "only 1" in reason


def test_strong_and_well_supported_is_sufficient():
    verdict, _, supporting = decide([0.80, 0.70, 0.20], T)
    assert verdict is Verdict.SUFFICIENT and supporting == 2


def test_two_equally_good_chunks_are_not_penalised():
    # The guide's "margin" rule would call this ambiguous; ours must not.
    assert decide([0.74, 0.74, 0.70], T)[0] is Verdict.SUFFICIENT


def test_thresholds_are_inclusive_at_the_boundary():
    assert decide([0.30], T)[0] is Verdict.INSUFFICIENT          # == oos -> not OOS
    assert decide([0.60, 0.50], T)[0] is Verdict.SUFFICIENT      # == suff, == floor


def test_decide_does_not_depend_on_input_order():
    assert decide([0.50, 0.80, 0.70], T)[0] is Verdict.SUFFICIENT


# --- thresholds ----------------------------------------------------------------------

def test_threshold_validation():
    with pytest.raises(ValueError):
        ScopeThresholds(oos_threshold=0.7, sufficient_threshold=0.5)
    with pytest.raises(ValueError):
        ScopeThresholds(min_support=0)
    with pytest.raises(ValueError):
        ScopeThresholds(switch_margin=-0.1)


def test_missing_thresholds_file_gives_defaults(tmp_path):
    thresholds, source = load_thresholds(tmp_path / "nope.json")
    assert thresholds == ScopeThresholds()
    assert source == DEFAULTS_SOURCE


def test_save_then_load_roundtrip(tmp_path):
    path = tmp_path / "scope_thresholds.json"
    save_thresholds(T, path, {"n_cases": 12})
    loaded, source = load_thresholds(path)
    assert loaded == T
    assert source == str(path)
    assert json.loads(path.read_text())["calibration"]["n_cases"] == 12


def test_reload_picks_up_a_changed_file(tmp_path):
    import os
    path = tmp_path / "t.json"
    save_thresholds(T, path)
    load_thresholds(path)
    other = ScopeThresholds(oos_threshold=0.1, sufficient_threshold=0.2, support_floor=0.1, min_support=1)
    save_thresholds(other, path)
    os.utime(path, (path.stat().st_atime, path.stat().st_mtime + 5))   # force a new mtime
    assert load_thresholds(path)[0] == other


def test_unknown_key_in_thresholds_file_is_rejected(tmp_path):
    path = tmp_path / "t.json"
    path.write_text(json.dumps({"thresholds": {"oos_treshold": 0.3}}))   # typo
    with pytest.raises(ValueError):
        load_thresholds(path)


def test_broken_json_is_rejected(tmp_path):
    path = tmp_path / "t.json"
    path.write_text("{not json")
    with pytest.raises(ValueError):
        load_thresholds(path)


# --- check_sufficiency ------------------------------------------------------------------

def test_check_sufficiency_reports_scores_and_source():
    result = check_sufficiency([_chunk(0.8), _chunk(0.7, chunk_id="c2")], T)
    assert result.verdict is Verdict.SUFFICIENT
    assert result.top_similarity == 0.8
    assert result.supporting_chunks == 2
    assert result.chunks_considered == 2
    assert result.thresholds_source == "provided explicitly"


def test_check_sufficiency_on_empty_results():
    result = check_sufficiency([], T)
    assert result.verdict is Verdict.OUT_OF_SCOPE
    assert result.top_similarity is None


def test_result_to_dict_uses_plain_verdict_string():
    assert check_sufficiency([_chunk(0.9), _chunk(0.9, chunk_id="c2")], T).to_dict()["verdict"] == "SUFFICIENT"


# --- check_scope (service switching) --------------------------------------------------------

class _FakeRetriever:
    """retrieve() returns canned lists keyed by the service argument."""

    def __init__(self, by_service, services=("aadhaar", "passport")):
        self._by_service = by_service
        self._services = list(services)
        self.calls = []

    def retrieve(self, query, k=5, service=None):
        self.calls.append(service)
        return self._by_service[service.lower() if service else None]

    def available_services(self):
        return self._services


def test_without_a_service_there_is_no_extra_search():
    fake = _FakeRetriever({None: [_chunk(0.8), _chunk(0.7, chunk_id="c2")]})
    result, chunks = check_scope(fake, "q", service=None, thresholds=T)
    assert fake.calls == [None]
    assert result.suggested_service is None
    assert len(chunks) == 2


def test_suggests_switch_when_another_service_is_clearly_better():
    fake = _FakeRetriever({
        "passport": [_chunk(0.32, "passport")],
        None: [_chunk(0.75, "aadhaar"), _chunk(0.32, "passport", "c2")],
    })
    result, chunks = check_scope(fake, "update my mobile number", service="Passport", thresholds=T)
    assert result.verdict is Verdict.INSUFFICIENT          # judged on the chosen service only
    assert result.service == "passport"
    assert result.suggested_service == "aadhaar"
    assert result.suggested_service_similarity == 0.75
    assert [c.service_name for c in chunks] == ["passport"]  # chunks are the chosen service's
    assert fake.calls == ["Passport", None]                  # exactly one extra search


def test_no_suggestion_when_chosen_service_is_already_best():
    fake = _FakeRetriever({
        "passport": [_chunk(0.8), _chunk(0.7, chunk_id="c2")],
        None: [_chunk(0.8), _chunk(0.7, chunk_id="c2")],
    })
    result, _ = check_scope(fake, "q", service="passport", thresholds=T)
    assert result.suggested_service is None


def test_no_suggestion_when_other_service_is_only_slightly_better():
    fake = _FakeRetriever({
        "passport": [_chunk(0.55, "passport")],
        None: [_chunk(0.60, "aadhaar")],          # +0.05 < switch_margin 0.10
    })
    assert check_scope(fake, "q", service="passport", thresholds=T)[0].suggested_service is None


def test_no_suggestion_when_other_service_is_not_relevant_either():
    fake = _FakeRetriever({
        "passport": [_chunk(0.10, "passport")],
        None: [_chunk(0.25, "aadhaar")],          # below oos_threshold 0.30
    })
    result, _ = check_scope(fake, "how to bake a cake", service="passport", thresholds=T)
    assert result.verdict is Verdict.OUT_OF_SCOPE
    assert result.suggested_service is None


def test_unknown_service_error_propagates_from_retriever():
    class _Strict(_FakeRetriever):
        def retrieve(self, query, k=5, service=None):
            raise ValueError("Unknown service")

    with pytest.raises(ValueError):
        check_scope(_Strict({}), "q", service="driving-licence", thresholds=T)
