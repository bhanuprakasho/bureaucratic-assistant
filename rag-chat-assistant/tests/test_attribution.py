"""Tests for src/attribution/sources.py and the Step 9 citation choice in
generator.py / grounding.py. Fake LLM and fake embeddings: no models needed."""

from __future__ import annotations

import re
import zlib

from src.attribution.sources import (
    URL_UNAVAILABLE,
    build_sources,
    format_pages,
    format_sources,
    sources_for_answer,
)
from src.generation.generator import AnswerStatus, generate_answer, select_cited_chunk_ids
from src.generation.prompts import NOT_ENOUGH_INFO_SENTENCE
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

    def __init__(self, reply):
        self.reply = reply

    def generate(self, system, user):
        return self.reply


def chunk(text, chunk_id, file_name="manual.pdf", p0=3, p1=None, url="https://gov.in/manual.pdf",
          similarity=0.8, service="passport"):
    return RetrievedChunk(
        chunk_id=chunk_id, text=text, similarity=similarity, distance=1 - similarity,
        service_name=service, file_name=file_name, page_start=p0,
        page_end=p0 if p1 is None else p1, source_url=url,
    )


MINOR = chunk("The following documents are required for a minor: birth certificate, "
              "ID proof of the parent and Annexure C.", "c1", p0=19, p1=20)
FEES = chunk("The fee schedule is published on the portal and is revised from time to time.",
             "c2", file_name="booklet.pdf", p0=9, url=None, similarity=0.7)
GOOD = "A minor needs a birth certificate, ID proof of the parent and Annexure C."


def run(llm, chunks):
    return generate_answer("what documents does a minor need", list(chunks), llm,
                           min_similarity=0.0, embed_fn=fake_embed)


# --- format_pages -------------------------------------------------------------------

def test_format_pages():
    assert format_pages(()) == ""
    assert format_pages((5,)) == "page 5"
    assert format_pages((19, 20)) == "pages 19-20"
    assert format_pages((32, 19, 20, 21, 19)) == "pages 19-21, 32"


# --- build_sources --------------------------------------------------------------------

def test_chunks_of_one_document_are_merged_with_page_union():
    a = chunk("x", "a", p0=19, p1=20)
    b = chunk("y", "b", p0=20, p1=21)
    c = chunk("z", "c", p0=32)
    (src,) = build_sources([a, b, c])
    assert src.pages == (19, 20, 21, 32)
    assert src.page_label == "pages 19-21, 32"
    assert src.chunk_ids == ("a", "b", "c")


def test_documents_keep_rank_order_and_are_separate():
    sources = build_sources([FEES, MINOR])
    assert [s.file_name for s in sources] == ["booklet.pdf", "manual.pdf"]


def test_same_file_name_in_two_services_is_not_merged():
    a = chunk("x", "a", service="passport")
    b = chunk("y", "b", service="aadhaar")
    assert len(build_sources([a, b])) == 2


def test_missing_url_is_none_and_never_invented():
    (src,) = build_sources([FEES])
    assert src.source_url is None
    assert URL_UNAVAILABLE in format_sources([src])


def test_url_is_taken_from_any_chunk_that_has_one():
    no_url = chunk("x", "a", url=None)
    with_url = chunk("y", "b", url="https://gov.in/m.pdf")
    assert build_sources([no_url, with_url])[0].source_url == "https://gov.in/m.pdf"


def test_missing_page_is_left_out_not_invented():
    c = chunk("x", "a", p0=None)
    (src,) = build_sources([c])
    assert src.pages == ()
    assert "page" not in format_sources([src]).lower().replace("pages", "")


def test_format_sources_layout_and_empty():
    assert format_sources([]) == ""
    text = format_sources(build_sources([MINOR]))
    assert text.splitlines() == ["Sources:", "  1. manual.pdf (pages 19-20)", "     https://gov.in/manual.pdf"]


def test_to_dict_has_display_fields():
    d = build_sources([MINOR])[0].to_dict()
    assert d["document_name"] == "manual.pdf" and d["page_label"] == "pages 19-20"


# --- which chunks get cited ----------------------------------------------------------------

def test_grounded_answer_cites_only_the_chunk_that_supports_it():
    answer = run(FakeLLM(GOOD), [MINOR, FEES])
    assert answer.status is AnswerStatus.GROUNDED
    assert answer.context_chunk_ids == ("c1", "c2")      # both were in the prompt
    assert answer.cited_chunk_ids == ("c1",)             # only one backs the answer
    (src,) = sources_for_answer(answer, [MINOR, FEES])
    assert src.file_name == "manual.pdf" and src.page_label == "pages 19-20"


def test_answer_using_both_chunks_cites_both_in_rank_order():
    answer = run(FakeLLM(GOOD + " The fee schedule is published on the portal and is revised from time to time."),
                 [MINOR, FEES])
    assert answer.cited_chunk_ids == ("c1", "c2")


def test_answer_with_no_checkable_sentence_cites_the_best_chunk():
    answer = run(FakeLLM("Annexure C."), [MINOR, FEES])
    assert answer.status is AnswerStatus.GROUNDED
    assert answer.cited_chunk_ids == ("c1",)


def test_fallback_cites_the_chunks_it_shows():
    answer = run(FakeLLM("A minor needs a birth certificate and the fee is 4500 rupees."), [MINOR, FEES])
    assert answer.status is AnswerStatus.FALLBACK
    assert answer.cited_chunk_ids == ("c1", "c2")


def test_refusal_cites_nothing():
    answer = run(FakeLLM(NOT_ENOUGH_INFO_SENTENCE), [MINOR])
    assert answer.status is AnswerStatus.NOT_ENOUGH_INFO
    assert answer.cited_chunk_ids == ()
    assert sources_for_answer(answer, [MINOR]) == []


def test_unknown_cited_ids_are_ignored():
    answer = run(FakeLLM(GOOD), [MINOR])
    assert sources_for_answer(answer, [FEES]) == []


def test_select_cited_chunk_ids_handles_empty_inputs():
    assert select_cited_chunk_ids([], None) == ()
    assert select_cited_chunk_ids([MINOR], None) == ("c1",)
