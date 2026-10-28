"""
Step 8 - Grounding verification.

Decides whether a generated answer says only things the retrieved text
supports. Two independent checks; BOTH must pass:

1. Numbers (strict). Every number in the answer (fees, years, dates,
   form numbers) must also appear in the retrieved text or in the user's
   own question. Invented figures are the most damaging kind of
   hallucination in a government-facts assistant, and this check catches
   them cheaply and reliably. List markers ("1.", "2)") are ignored.

2. Meaning (soft). Each answer sentence is embedded and compared with
   every piece of the retrieved text (cosine similarity, using the same
   embedding model as retrieval). A sentence is "supported" when its best
   match reaches `sentence_threshold`; the answer passes when at least
   `min_supported_fraction` of its sentences are supported. Very short
   sentences (< 4 words) are skipped.

Known limits (state them in your report):
- This is a similarity check, not logical entailment. It catches answers
  that drift away from the source, and invented figures, but not a
  subtly wrong statement that reuses the source's vocabulary.
- A number written as a word in the source ("fifteen") but as a digit in
  the answer ("15") is flagged. That errs on the safe side: the system
  falls back to showing the source text.
- The default thresholds are un-calibrated starting points. Tune them by
  looking at real answers (scripts/ask.py --show-grounding).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

import numpy as np

EmbedFn = Callable[[list[str]], list[list[float]]]

DEFAULT_SENTENCE_THRESHOLD = 0.45
DEFAULT_MIN_SUPPORTED_FRACTION = 0.8
MIN_WORDS_TO_CHECK = 4

# Long source sentences dilute the embedding, so they are cut into
# overlapping word windows before comparison.
_MAX_PIECE_WORDS = 50
_WINDOW_WORDS = 40
_WINDOW_STRIDE = 20

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;:])\s+|\n+")
_LIST_MARKER_RE = re.compile(r"^\s*(?:\d+[.)]|[-*\u2022])\s+", re.MULTILINE)
_NUMBER_RE = re.compile(r"\d+(?:,\d+)*(?:\.\d+)?")


@dataclass
class SentenceCheck:
    sentence: str
    best_similarity: float
    supported: bool
    # Index (into the `context_texts` passed to check_grounding) of the
    # retrieved text this sentence matched best. Step 9 uses it to cite only
    # the chunks that actually back the answer. None if there was no source.
    source_index: Optional[int] = None


@dataclass
class GroundingResult:
    passed: bool
    reason: str
    unsupported_numbers: list[str] = field(default_factory=list)
    sentence_checks: list[SentenceCheck] = field(default_factory=list)
    supported_fraction: float = 1.0


# --- text helpers --------------------------------------------------------------------

def strip_list_markers(text: str) -> str:
    """Remove leading '1.', '2)', '-', '*', bullets so they are not read as numbers."""
    return _LIST_MARKER_RE.sub("", text)


def extract_numbers(text: str) -> set[str]:
    """All numbers in `text`, with thousands separators removed ('1,500' -> '1500')."""
    text = unicodedata.normalize("NFKC", text)
    return {m.group().replace(",", "") for m in _NUMBER_RE.finditer(text)}


def split_sentences(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text)
    return [p.strip() for p in _SENTENCE_SPLIT_RE.split(text) if p and p.strip()]


def context_pieces(context_texts: Sequence[str]) -> list[str]:
    """Break retrieved text into sentence-sized pieces to compare against."""
    return [piece for _, piece in context_pieces_with_source(context_texts)]


def context_pieces_with_source(context_texts: Sequence[str]) -> list[tuple[int, str]]:
    """Like context_pieces, but each piece is paired with the index of the
    context text it came from, so a match can be traced back to its chunk."""
    pieces: list[tuple[int, str]] = []
    for source_index, text in enumerate(context_texts):
        for sentence in split_sentences(text):
            words = sentence.split()
            if len(words) <= _MAX_PIECE_WORDS:
                pieces.append((source_index, sentence))
                continue
            for start in range(0, len(words), _WINDOW_STRIDE):
                pieces.append((source_index, " ".join(words[start:start + _WINDOW_WORDS])))
                if start + _WINDOW_WORDS >= len(words):
                    break
    return pieces


def default_embed_fn() -> EmbedFn:
    """Embedding function using the same model as retrieval (cached, so
    this does not load the model a second time)."""
    import config
    from src.indexing.embedder import embed_texts, load_embedding_model

    model = load_embedding_model(config.EMBEDDING_MODEL_NAME)
    return lambda texts: embed_texts(model, texts)


def _cosine_matrix(a: list[list[float]], b: list[list[float]]) -> np.ndarray:
    A = np.asarray(a, dtype=float)
    B = np.asarray(b, dtype=float)
    A = A / np.clip(np.linalg.norm(A, axis=1, keepdims=True), 1e-12, None)
    B = B / np.clip(np.linalg.norm(B, axis=1, keepdims=True), 1e-12, None)
    return A @ B.T


# --- the check --------------------------------------------------------------------------

def check_grounding(
    answer: str,
    context_texts: Sequence[str],
    query: str = "",
    embed_fn: Optional[EmbedFn] = None,
    sentence_threshold: float = DEFAULT_SENTENCE_THRESHOLD,
    min_supported_fraction: float = DEFAULT_MIN_SUPPORTED_FRACTION,
) -> GroundingResult:
    """Does `answer` stay within what `context_texts` (and the question) say?"""
    if not answer or not answer.strip():
        return GroundingResult(passed=False, reason="The answer is empty.")

    cleaned = strip_list_markers(answer)

    # 1. Numbers must come from the source or the question.
    allowed = extract_numbers(" ".join(context_texts)) | extract_numbers(query)
    unsupported_numbers = sorted(extract_numbers(cleaned) - allowed)

    # 2. Sentences must be semantically close to some piece of the source.
    sentences = [s for s in split_sentences(cleaned) if len(s.split()) >= MIN_WORDS_TO_CHECK]
    tagged_pieces = context_pieces_with_source(context_texts)
    pieces = [piece for _, piece in tagged_pieces]

    checks: list[SentenceCheck] = []
    if sentences:
        if not pieces:
            checks = [SentenceCheck(s, 0.0, False, None) for s in sentences]
        else:
            embed = embed_fn or default_embed_fn()
            vectors = embed(sentences + pieces)
            similarity = _cosine_matrix(vectors[: len(sentences)], vectors[len(sentences):])
            best = similarity.max(axis=1)
            best_piece = similarity.argmax(axis=1)
            checks = [
                SentenceCheck(
                    s, float(b), bool(b >= sentence_threshold),
                    source_index=tagged_pieces[int(i)][0],
                )
                for s, b, i in zip(sentences, best, best_piece)
            ]

    supported_fraction = (
        sum(c.supported for c in checks) / len(checks) if checks else 1.0
    )

    problems: list[str] = []
    if unsupported_numbers:
        problems.append(
            "number(s) not found in the source text: " + ", ".join(unsupported_numbers)
        )
    if supported_fraction < min_supported_fraction:
        weak = [c for c in checks if not c.supported]
        problems.append(
            f"only {supported_fraction:.0%} of sentences are supported by the source "
            f"(need {min_supported_fraction:.0%}); weakest: {weak[0].sentence!r}"
        )

    return GroundingResult(
        passed=not problems,
        reason="; ".join(problems) if problems else "All numbers and sentences are supported by the source text.",
        unsupported_numbers=unsupported_numbers,
        sentence_checks=checks,
        supported_fraction=supported_fraction,
    )
