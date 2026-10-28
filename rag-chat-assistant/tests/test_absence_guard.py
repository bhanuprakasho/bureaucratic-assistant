"""Tests for the 'model claims something is missing' guard in generator.py."""

from __future__ import annotations

import re
import zlib

import pytest

from src.generation.generator import AnswerStatus, claims_absence, generate_answer
from src.generation.prompts import NOT_ENOUGH_INFO_SENTENCE
from src.retrieval.retriever import RetrievedChunk

DIM = 256


def fake_embed(texts):
    out = []
    for text in texts:
        v = [0.0] * DIM
        for w in re.findall(r"[a-z0-9]+", text.lower()):
            v[zlib.crc32(w.encode()) % DIM] += 1.0
        out.append(v)
    return out


class FakeLLM:
    model = "fake"

    def __init__(self, reply):
        self.reply = reply

    def generate(self, system, user):
        return self.reply


MINOR = RetrievedChunk(
    chunk_id="c1", similarity=0.8, distance=0.2, service_name="passport",
    file_name="manual.pdf", page_start=19, page_end=19, source_url="https://gov.in/m.pdf",
    text="The following documents are required for a minor: birth certificate, "
         "ID proof of the parent and Annexure C.",
)


@pytest.mark.parametrize("text", [
    "There is no Annexure C mentioned in the provided documents.",
    "Annexure C is not mentioned.",
    "The documents do not contain this information.",
    "I cannot find the fee in the text.",
    "No information is available about this.",
    "The provided text does not include a fee.",
    "Not enough information to answer.",
])
def test_absence_claims_are_detected(text):
    assert claims_absence(text)


@pytest.mark.parametrize("text", [
    "A minor needs a birth certificate, ID proof of the parent and Annexure C.",
    "An affidavit need not be provided for applicants above 18 years.",
    "A photograph is not required at the time of the visit.",
    "No fee is charged for this service.",
    "Documents are required if the name has changed.",
])
def test_normal_answers_are_not_flagged(text):
    assert not claims_absence(text)


def test_absence_claim_falls_back_to_source_text_with_sources():
    answer = generate_answer(
        "what documents does a minor need", [MINOR],
        FakeLLM("There is no Annexure C mentioned in the provided documents."),
        min_similarity=0.0, embed_fn=fake_embed,
    )
    assert answer.status is AnswerStatus.FALLBACK
    assert answer.fallback_reason.startswith("model_claimed_absence")
    assert "Annexure C" in answer.text and "manual.pdf, page 19" in answer.text
    assert "no Annexure C mentioned" not in answer.text      # the false denial is never shown
    assert answer.cited_chunk_ids == ("c1",)


def test_exact_refusal_sentence_is_still_a_refusal_not_a_fallback():
    answer = generate_answer("q", [MINOR], FakeLLM(NOT_ENOUGH_INFO_SENTENCE),
                             min_similarity=0.0, embed_fn=fake_embed)
    assert answer.status is AnswerStatus.NOT_ENOUGH_INFO
    assert answer.cited_chunk_ids == ()


def test_normal_answer_is_unaffected():
    good = "A minor needs a birth certificate, ID proof of the parent and Annexure C."
    answer = generate_answer("q", [MINOR], FakeLLM(good), min_similarity=0.0, embed_fn=fake_embed)
    assert answer.status is AnswerStatus.GROUNDED and answer.text == good
