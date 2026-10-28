"""Tests for src/retrieval/metrics.py (pure functions, no I/O)."""

from __future__ import annotations

from dataclasses import dataclass

from src.retrieval.metrics import (
    first_hit_rank,
    is_hit,
    normalize_for_match,
    recall_at,
    text_contains_any,
)


@dataclass
class _Chunk:
    file_name: str
    text: str


def test_normalize_ignores_case_and_whitespace():
    assert normalize_for_match("  Short\n  VALIDITY\tpassport ") == "short validity passport"


def test_text_contains_any_matches_across_line_breaks():
    text = "Students up to the age of\n15 years are eligible"
    assert text_contains_any(text, ["age of 15 years"])


def test_text_contains_any_false_when_no_phrase_matches():
    assert not text_contains_any("fee schedule", ["minor", "guardian"])


def test_blank_phrase_never_matches():
    assert not text_contains_any("anything", ["", "   "])


def test_hit_requires_correct_file_and_phrase():
    chunk = _Chunk("a.pdf", "Passports to Minors are issued ...")
    assert is_hit(chunk, "a.pdf", ["passports to minors"])
    assert not is_hit(chunk, "b.pdf", ["passports to minors"])   # wrong file
    assert not is_hit(chunk, "a.pdf", ["fee"])                    # wrong content


def test_first_hit_rank_is_one_based_and_none_when_absent():
    results = [_Chunk("x.pdf", "nothing"), _Chunk("a.pdf", "the answer here"), _Chunk("a.pdf", "the answer here")]
    assert first_hit_rank(results, "a.pdf", ["answer here"]) == 2
    assert first_hit_rank(results, "a.pdf", ["missing phrase"]) is None


def test_recall_at_counts_cases_within_cutoff():
    ranks = [1, 3, 5, 8, None]
    assert recall_at(ranks, 1) == 1 / 5
    assert recall_at(ranks, 3) == 2 / 5
    assert recall_at(ranks, 5) == 3 / 5


def test_recall_at_empty_is_zero():
    assert recall_at([], 5) == 0.0
