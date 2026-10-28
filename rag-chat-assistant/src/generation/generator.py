"""
Step 8 - RAG answer generation with a grounding gate.

    chunks (from Step 5, already approved by Step 6)
        -> pick the well-matching chunks as context
        -> prompt the LLM (context-only rules)
        -> refusal sentence?            -> NOT_ENOUGH_INFO
        -> claims something is missing? -> FALLBACK
        -> grounding check passes?      -> GROUNDED  (the LLM's answer)
        -> otherwise / LLM failed       -> FALLBACK  (source text shown directly)

The caller must only call this after `check_scope` returned SUFFICIENT.
generate_answer does not re-decide scope; it assumes the chunks can
support an answer and then verifies the generated text anyway
(defence in depth).

Nothing is ever returned to the user unchecked: the LLM's wording is used
only if the grounding check passed. This module only decides WHICH chunks
back the answer (`cited_chunk_ids`); turning them into a source list
(document, pages, official URL) is src/attribution/sources.py (Step 9).
The fallback text also names the file and page it quotes, because there
the quoted text IS the answer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Sequence

from src.generation.grounding import (
    DEFAULT_MIN_SUPPORTED_FRACTION,
    DEFAULT_SENTENCE_THRESHOLD,
    EmbedFn,
    GroundingResult,
    check_grounding,
)
from src.generation.llm_client import LLMClient, LLMError
from src.generation.prompts import (
    NOT_ENOUGH_INFO_SENTENCE,
    SYSTEM_PROMPT,
    ReasoningResult,
    build_user_prompt,
)
from src.retrieval.metrics import normalize_for_match
from src.retrieval.retriever import RetrievedChunk
from src.scope.sufficiency import load_thresholds
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

MAX_CONTEXT_CHUNKS = 5
MAX_CONTEXT_CHARS = 6000          # keeps prompt + context inside the 4096-token window
FALLBACK_CHUNKS = 2
FALLBACK_EXCERPT_CHARS = 700

FALLBACK_INTRO = (
    "I couldn't safely rephrase this in simpler words, so here is what the "
    "official documents say:"
)


class AnswerStatus(str, Enum):
    GROUNDED = "GROUNDED"                  # LLM answer, passed the grounding check
    FALLBACK = "FALLBACK"                  # source text shown instead of the LLM answer
    NOT_ENOUGH_INFO = "NOT_ENOUGH_INFO"    # the LLM said the context lacks the answer


@dataclass(frozen=True)
class GeneratedAnswer:
    text: str
    status: AnswerStatus
    fallback_reason: Optional[str]
    grounding: Optional[GroundingResult]
    context_chunk_ids: tuple[str, ...]
    raw_llm_text: Optional[str]
    model: Optional[str]
    # Step 9: ids of the chunks that back the answer (a subset of
    # context_chunk_ids). Empty when nothing is cited, e.g. NOT_ENOUGH_INFO.
    cited_chunk_ids: tuple[str, ...] = ()

    @property
    def used_fallback(self) -> bool:
        return self.status is AnswerStatus.FALLBACK


# --- helpers ------------------------------------------------------------------------

def select_context_chunks(
    chunks: Sequence[RetrievedChunk],
    min_similarity: Optional[float] = None,
    max_chunks: int = MAX_CONTEXT_CHUNKS,
    max_chars: int = MAX_CONTEXT_CHARS,
) -> list[RetrievedChunk]:
    """Choose which retrieved chunks go into the prompt.

    A small model answers better from a few relevant chunks than from five
    chunks of which two are noise, so only chunks at or above the Step 6
    `support_floor` are used (at least the single best chunk is always kept),
    best first, within a size budget.
    """
    if min_similarity is None:
        min_similarity = load_thresholds()[0].support_floor

    selected = [c for c in chunks if c.similarity >= min_similarity][:max_chunks]
    if not selected:
        selected = list(chunks[:1])

    kept: list[RetrievedChunk] = []
    used = 0
    for chunk in selected:
        if kept and used + len(chunk.text) > max_chars:
            break
        kept.append(chunk)
        used += len(chunk.text)
    return kept


def select_cited_chunk_ids(
    context: Sequence[RetrievedChunk],
    grounding: Optional[GroundingResult],
) -> tuple[str, ...]:
    """Step 9: which context chunks to cite for a GROUNDED answer.

    A chunk is cited only if the grounding check matched at least one
    SUPPORTED answer sentence to it. Chunks that were merely in the prompt
    but backed nothing are not cited. If no sentence could be checked (all
    were too short), the single best context chunk is cited so the answer
    is never shown without a source. Order follows the context (best first).
    """
    if not context:
        return ()
    used = {
        c.source_index
        for c in (grounding.sentence_checks if grounding else [])
        if c.supported and c.source_index is not None
    }
    if not used:
        return (context[0].chunk_id,)
    return tuple(ch.chunk_id for i, ch in enumerate(context) if i in used)


# Words that say "this is missing". The negation must come shortly BEFORE a
# verb about mentioning/containing, so "need not be provided" or "photograph
# is not required" (real rules) are not caught, but "no Annexure C mentioned",
# "is not mentioned", "does not contain" and "cannot find" are.
_NEGATION = r"(?:\bno\b|\bnot\b|n't\b|\bnone\b|\bcannot\b|\bunable\b)"
_MENTION_VERB = r"(?:mention(?:s|ed)?|specified|stated|listed|found|find|contains?|contained)"
_ABSENCE_PATTERNS = [
    re.compile(rf"{_NEGATION}\W+(?:\w+\W+){{0,5}}?{_MENTION_VERB}\b", re.IGNORECASE),
    re.compile(r"\b(?:no|not enough|insufficient|lack of)\s+(?:relevant\s+|specific\s+|further\s+)?information\b", re.IGNORECASE),
    re.compile(r"\bno\s+(?:mention|details?)\b", re.IGNORECASE),
]
# "... in the provided documents" together with any negation in the sentence.
_SOURCE_REFERENCE = re.compile(r"\b(?:provided|given|supplied)\s+(?:documents?|text|information|context|sources?)\b", re.IGNORECASE)
_ANY_NEGATION = re.compile(_NEGATION, re.IGNORECASE)


def claims_absence(llm_text: str) -> bool:
    """Does the answer claim that something is missing from the documents?

    The scope check has already judged the documents SUFFICIENT, so a
    reworded "not mentioned in the documents" contradicts it. The exact
    fixed refusal sentence is handled earlier by is_refusal; this catches
    paraphrases, which the similarity-based grounding check cannot (it
    sees shared words, not meaning). A word-pattern net, not a guarantee.
    """
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", llm_text):
        if any(p.search(sentence) for p in _ABSENCE_PATTERNS):
            return True
        if _SOURCE_REFERENCE.search(sentence) and _ANY_NEGATION.search(sentence):
            return True
    return False


def is_refusal(llm_text: str) -> bool:
    """Did the model use the fixed 'not enough information' sentence?"""
    return normalize_for_match(NOT_ENOUGH_INFO_SENTENCE) in normalize_for_match(llm_text)


def _page_label(chunk: RetrievedChunk) -> str:
    if chunk.page_start is None:
        return ""
    if chunk.page_end in (None, chunk.page_start):
        return f", page {chunk.page_start}"
    return f", pages {chunk.page_start}-{chunk.page_end}"


def _excerpt(text: str, max_chars: int) -> str:
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + " ..."


def build_template_fallback(
    chunks: Sequence[RetrievedChunk],
    max_chunks: int = FALLBACK_CHUNKS,
    max_chars: int = FALLBACK_EXCERPT_CHARS,
) -> str:
    """Answer built straight from the retrieved text (no LLM wording)."""
    blocks = [
        f"From {c.file_name or 'the document'}{_page_label(c)}:\n{_excerpt(c.text, max_chars)}"
        for c in chunks[:max_chunks]
    ]
    return FALLBACK_INTRO + "\n\n" + "\n\n".join(blocks)


# --- main entry point --------------------------------------------------------------------

def generate_answer(
    query: str,
    chunks: Sequence[RetrievedChunk],
    llm: LLMClient,
    service: Optional[str] = None,
    reasoning_result: Optional[ReasoningResult] = None,
    min_similarity: Optional[float] = None,
    embed_fn: Optional[EmbedFn] = None,
    sentence_threshold: float = DEFAULT_SENTENCE_THRESHOLD,
    min_supported_fraction: float = DEFAULT_MIN_SUPPORTED_FRACTION,
) -> GeneratedAnswer:
    """Generate a grounded answer for `query` from `chunks`.

    `reasoning_result` is the optional slot for Step 7's verified facts
    (None for now). Raises ValueError if there are no chunks: call
    check_scope first and only generate on SUFFICIENT.
    """
    if not chunks:
        raise ValueError(
            "generate_answer needs at least one retrieved chunk. "
            "Run check_scope first and only generate when the verdict is SUFFICIENT."
        )

    context = select_context_chunks(chunks, min_similarity=min_similarity)
    context_ids = tuple(c.chunk_id for c in context)

    def fallback(reason: str, raw: Optional[str] = None,
                 grounding: Optional[GroundingResult] = None) -> GeneratedAnswer:
        logger.warning("Using template fallback: %s", reason)
        return GeneratedAnswer(
            text=build_template_fallback(context),
            status=AnswerStatus.FALLBACK,
            fallback_reason=reason,
            grounding=grounding,
            context_chunk_ids=context_ids,
            raw_llm_text=raw,
            model=getattr(llm, "model", None),
            cited_chunk_ids=tuple(c.chunk_id for c in context[:FALLBACK_CHUNKS]),
        )

    user_prompt = build_user_prompt(query, context, service=service, reasoning_result=reasoning_result)
    try:
        raw = llm.generate(SYSTEM_PROMPT, user_prompt)
    except LLMError as exc:
        return fallback(f"llm_error: {exc}")

    if is_refusal(raw):
        return GeneratedAnswer(
            text=NOT_ENOUGH_INFO_SENTENCE,
            status=AnswerStatus.NOT_ENOUGH_INFO,
            fallback_reason=None,
            grounding=None,
            context_chunk_ids=context_ids,
            raw_llm_text=raw,
            model=getattr(llm, "model", None),
        )

    # A reworded "not mentioned in the documents" contradicts the SUFFICIENT
    # verdict and would otherwise sail through the similarity-based check.
    if claims_absence(raw):
        return fallback("model_claimed_absence: the answer says something is missing "
                        "although the documents were judged sufficient", raw=raw)

    grounding = check_grounding(
        raw,
        [c.text for c in context],
        query=query,
        embed_fn=embed_fn,
        sentence_threshold=sentence_threshold,
        min_supported_fraction=min_supported_fraction,
    )
    if not grounding.passed:
        return fallback(f"grounding_failed: {grounding.reason}", raw=raw, grounding=grounding)

    return GeneratedAnswer(
        text=raw,
        status=AnswerStatus.GROUNDED,
        fallback_reason=None,
        grounding=grounding,
        context_chunk_ids=context_ids,
        raw_llm_text=raw,
        model=getattr(llm, "model", None),
        cited_chunk_ids=select_cited_chunk_ids(context, grounding),
    )
