"""
Pure helpers for evaluating retrieval (Recall@k).

A retrieved chunk counts as a HIT for a test case when:
  1. it comes from the expected PDF file, AND
  2. its text contains at least one of the case's `must_contain` phrases.

Matching is case-insensitive, Unicode-normalized (NFKC, same as the
Step 3 cleaner) and ignores differences in whitespace/line breaks.

This deliberately does NOT use chunk_ids: they are sequential counters
that change whenever chunk size/overlap changes, which would silently
break every test case.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional, Sequence

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_for_match(text: str) -> str:
    """Lowercase, NFKC-normalize and collapse all whitespace."""
    text = unicodedata.normalize("NFKC", text or "")
    return _WHITESPACE_RE.sub(" ", text).strip().lower()


def text_contains_any(text: str, phrases: Iterable[str]) -> bool:
    """True if the normalized text contains any normalized phrase."""
    haystack = normalize_for_match(text)
    for phrase in phrases:
        needle = normalize_for_match(phrase)
        if needle and needle in haystack:
            return True
    return False


def is_hit(chunk, expected_file: str, phrases: Sequence[str]) -> bool:
    """Is this single retrieved chunk a hit? `chunk` needs .file_name and .text."""
    return chunk.file_name == expected_file and text_contains_any(chunk.text, phrases)


def first_hit_rank(
    results: Sequence,
    expected_file: str,
    phrases: Sequence[str],
) -> Optional[int]:
    """1-based rank of the first hit in `results`, or None if there is none."""
    for rank, chunk in enumerate(results, start=1):
        if is_hit(chunk, expected_file, phrases):
            return rank
    return None


def recall_at(ranks: Sequence[Optional[int]], n: int) -> float:
    """Fraction of cases whose first hit is within the top n.
    `ranks` holds one first-hit rank (or None) per case."""
    if not ranks:
        return 0.0
    hits = sum(1 for r in ranks if r is not None and r <= n)
    return hits / len(ranks)
