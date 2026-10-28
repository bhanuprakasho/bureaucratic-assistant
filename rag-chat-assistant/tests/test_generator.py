"""Tests for src/generation/generator.py and prompts.py.

A fake LLM and a fake embedding function are used, so no model is needed.
"""

from __future__ import annotations

import re
import zlib

import pytest

from src.generation.generator import (
    AnswerStatus,
    build_template_fallback,
    generate_answer,
    is_refusal,
    select_context_chunks,
)
from src.generation.llm_client import LLMError, LLMUnavailableError
from src.generation.prompts import (
    NOT_ENOUGH_INFO_SENTENCE,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from src.retrieval.retriever import RetrievedChunk

DIM = 256


def fake_embed(texts):
    vectors = []
    for text in texts:
        v = [0.0] * DIM
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            v[zlib.crc32(word.encode()) % DIM] += 1.0
        vectors.append(v)
    return vectors


class FakeLLM:
    model = "fake-model"

    def __init__(self, reply=None, error=None):
        self.reply, self.error = reply, error
        self.calls = []

    def generate(self, system, user):
        self.calls.append((system, user))
        if self.error:
            raise self.error
        return self.reply


def chunk(text, similarity=0.8, chunk_id="c1", file_name="manual.pdf", page=3, page_end=None):
    return RetrievedChunk(
        chunk_id=chunk_id, text=text, similarity=similarity, distance=1 - similarity,
        service_name="passport", file_name=file_name,
        page_start=page, page_end=page if page_end is None else page_end,
    )


MINOR = chunk(
    "The following documents are required for a minor: birth certificate, "
    "ID proof of the parent and Annexure C. Minor passports are valid for 5 years.",
    similarity=0.80, chunk_id="c1",
)
FEES = chunk("The fee schedule is published on the portal.", similarity=0.40, chunk_id="c2", page=9)

GOOD = "A minor needs a birth certificate, ID proof of the parent and Annexure C."


def run(llm, chunks=(MINOR,), **kwargs):
    return generate_answer(
        "what documents does a minor need", list(chunks), llm,
        min_similarity=0.0, embed_fn=fake_embed, **kwargs,
    )


# --- outcomes ----------------------------------------------------------------------

def test_grounded_answer_is_returned_unchanged():
    llm = FakeLLM(GOOD)
    answer = run(llm)
    assert answer.status is AnswerStatus.GROUNDED
    assert answer.text == GOOD
    assert not answer.used_fallback
    assert answer.grounding.passed
    assert answer.context_chunk_ids == ("c1",)
    assert answer.model == "fake-model"


def test_invented_number_triggers_template_fallback_with_source_and_page():
    answer = run(FakeLLM("A minor needs a birth certificate and the fee is 4500 rupees."))
    assert answer.status is AnswerStatus.FALLBACK
    assert answer.used_fallback
    assert answer.fallback_reason.startswith("grounding_failed")
    assert "4500" in answer.fallback_reason
    assert "manual.pdf, page 3" in answer.text           # fallback shows where the text is from
    assert "birth certificate" in answer.text            # and quotes the source
    assert "4500" not in answer.text                     # the bad LLM text is never shown
    assert answer.raw_llm_text.endswith("4500 rupees.")  # kept for debugging only


def test_refusal_sentence_is_detected_and_returned_as_is():
    answer = run(FakeLLM(f'"{NOT_ENOUGH_INFO_SENTENCE}"'))
    assert answer.status is AnswerStatus.NOT_ENOUGH_INFO
    assert answer.text == NOT_ENOUGH_INFO_SENTENCE
    assert answer.grounding is None


def test_llm_unreachable_falls_back_to_source_text():
    answer = run(FakeLLM(error=LLMUnavailableError("Could not reach Ollama")))
    assert answer.status is AnswerStatus.FALLBACK
    assert answer.fallback_reason.startswith("llm_error")
    assert "Could not reach Ollama" in answer.fallback_reason
    assert "birth certificate" in answer.text


def test_other_llm_errors_also_fall_back():
    answer = run(FakeLLM(error=LLMError("model not found")))
    assert answer.status is AnswerStatus.FALLBACK


def test_no_chunks_is_rejected():
    with pytest.raises(ValueError):
        generate_answer("q", [], FakeLLM(GOOD), min_similarity=0.0, embed_fn=fake_embed)


# --- prompt -------------------------------------------------------------------------

def test_prompt_contains_rules_context_question_and_closing_reminder():
    llm = FakeLLM(GOOD)
    run(llm, service="passport")
    system, user = llm.calls[0]
    assert system == SYSTEM_PROMPT
    assert "ONLY from the CONTEXT" in system
    assert "SERVICE: passport" in user
    assert "birth certificate" in user                       # retrieved text is in the prompt
    assert "what documents does a minor need" in user        # so is the question
    assert user.rstrip().endswith(f'"{NOT_ENOUGH_INFO_SENTENCE}"')   # rule repeated last


def test_prompt_does_not_leak_file_names_or_pages():
    user = build_user_prompt("q", [MINOR])
    assert "manual.pdf" not in user and "page" not in user.lower()


def test_verified_facts_block_only_appears_when_provided():
    assert "VERIFIED FACTS" not in build_user_prompt("q", [MINOR])
    with_facts = build_user_prompt("q", [MINOR], reasoning_result={"branch": "minor", "age": 16})
    assert "VERIFIED FACTS" in with_facts
    assert "- branch: minor" in with_facts


# --- context selection --------------------------------------------------------------------

def test_only_well_matching_chunks_go_into_the_context():
    selected = select_context_chunks([MINOR, FEES], min_similarity=0.5)
    assert [c.chunk_id for c in selected] == ["c1"]


def test_best_chunk_is_kept_even_if_nothing_reaches_the_floor():
    selected = select_context_chunks([FEES], min_similarity=0.9)
    assert [c.chunk_id for c in selected] == ["c2"]


def test_context_respects_the_size_budget():
    big = [chunk("x" * 800, similarity=0.9 - i * 0.01, chunk_id=f"b{i}") for i in range(5)]
    selected = select_context_chunks(big, min_similarity=0.0, max_chars=2000)
    assert [c.chunk_id for c in selected] == ["b0", "b1"]


# --- helpers ---------------------------------------------------------------------------------

def test_is_refusal_ignores_case_quotes_and_extra_text():
    assert is_refusal(NOT_ENOUGH_INFO_SENTENCE.upper())
    assert is_refusal(f'Sorry. "{NOT_ENOUGH_INFO_SENTENCE}"')
    assert not is_refusal(GOOD)


def test_template_fallback_formats_page_ranges_and_truncates():
    c = chunk("word " * 400, file_name="a.pdf", page=4, page_end=6)
    text = build_template_fallback([c], max_chars=100)
    assert "From a.pdf, pages 4-6:" in text
    assert text.endswith("...")
    assert len(text) < 400
