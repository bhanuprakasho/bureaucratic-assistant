"""
Tests for src/retrieval/retriever.py.

Uses a fake Chroma collection and a fake embedding model, so no model is
downloaded and nothing is written to disk. Real end-to-end retrieval is
checked manually with scripts/search_chunks.py and
scripts/eval_retrieval.py.
"""

from __future__ import annotations

import pytest

from src.retrieval.retriever import (
    MAX_QUERY_CHARS,
    Retriever,
    build_retrieved_chunk,
)


class _FakeArray:
    def __init__(self, rows):
        self._rows = rows

    def tolist(self):
        return self._rows


class _FakeModel:
    """Stands in for SentenceTransformer: encode() -> object with tolist()."""

    def encode(self, texts, **kwargs):
        return _FakeArray([[0.1, 0.2] for _ in texts])


def _record(chunk_id, service, file_name, text="some text", source_url="https://x/y.pdf"):
    meta = {
        "service_name": service,
        "file_name": file_name,
        "file_path": f"/docs/{service}/{file_name}",
        "page_start": 3,
        "page_end": 4,
        "chunk_index": 0,
        "char_count": len(text),
        "pdf_title": "",          # Step 4 stores None as ""
        "pdf_author": "",
        "source_url": source_url,
    }
    return (chunk_id, text, meta)


class _FakeCollection:
    def __init__(self, records):
        self._records = records
        self.last_query = None

    def count(self):
        return len(self._records)

    def get(self, limit=None, offset=0, include=None, **_):
        page = self._records[offset: offset + limit]
        return {"ids": [r[0] for r in page], "metadatas": [r[2] for r in page]}

    def query(self, query_embeddings, n_results, include=None, where=None):
        self.last_query = {"n_results": n_results, "where": where}
        pool = [
            r for r in self._records
            if not where or r[2]["service_name"] == where["service_name"]
        ][:n_results]
        return {
            "ids": [[r[0] for r in pool]],
            "documents": [[r[1] for r in pool]],
            "metadatas": [[r[2] for r in pool]],
            "distances": [[0.2 + 0.1 * i for i in range(len(pool))]],
        }


@pytest.fixture
def records():
    return [
        _record("passport_a_p001_c001", "passport", "a.pdf", "minor passport rules"),
        _record("passport_a_p002_c002", "passport", "a.pdf", "fee details"),
        _record("passport_b_p001_c001", "passport", "b.pdf", "forms"),
        _record("aadhaar_c_p001_c001", "aadhaar", "c.pdf", "address proof"),
        _record("voter-id_d_p001_c001", "voter-id", "d.pdf", "form 6", source_url=""),
    ]


@pytest.fixture
def retriever(records):
    return Retriever(_FakeCollection(records), _FakeModel())


# --- result conversion -------------------------------------------------------

def test_build_retrieved_chunk_computes_similarity_from_distance():
    chunk = build_retrieved_chunk("id1", "text", {"service_name": "passport"}, 0.25)
    assert chunk.similarity == pytest.approx(0.75)
    assert chunk.distance == 0.25


def test_build_retrieved_chunk_turns_blank_metadata_into_none():
    chunk = build_retrieved_chunk(
        "id1", "text",
        {"source_url": "", "pdf_title": "", "pdf_author": "", "service_name": "passport"},
        0.1,
    )
    assert chunk.source_url is None
    assert chunk.pdf_title is None
    assert chunk.pdf_author is None
    assert chunk.service_name == "passport"


def test_build_retrieved_chunk_does_not_invent_missing_fields():
    chunk = build_retrieved_chunk("id1", "text", {}, 0.1)
    assert chunk.file_name is None
    assert chunk.page_start is None


def test_to_dict_contains_text_score_and_metadata(retriever):
    result = retriever.retrieve("minor passport")[0].to_dict()
    for key in ("chunk_id", "text", "similarity", "service_name", "file_name",
                "page_start", "page_end", "source_url"):
        assert key in result


# --- retrieval behaviour -------------------------------------------------------

def test_retrieve_returns_ranked_chunks_best_first(retriever):
    results = retriever.retrieve("minor passport", k=3)
    assert len(results) == 3
    sims = [r.similarity for r in results]
    assert sims == sorted(sims, reverse=True)


def test_retrieve_default_k_is_five(retriever):
    assert len(retriever.retrieve("anything")) == 5


def test_retrieve_clamps_k_to_available_chunks(records):
    collection = _FakeCollection(records)
    r = Retriever(collection, _FakeModel())
    results = r.retrieve("anything", k=50)
    assert len(results) == len(records)
    assert collection.last_query["n_results"] == len(records)


def test_service_filter_restricts_results_and_clamps_n_results(records):
    collection = _FakeCollection(records)
    r = Retriever(collection, _FakeModel())
    results = r.retrieve("anything", k=10, service="passport")
    assert {x.service_name for x in results} == {"passport"}
    assert len(results) == 3
    assert collection.last_query["where"] == {"service_name": "passport"}
    assert collection.last_query["n_results"] == 3


def test_service_filter_is_case_insensitive(retriever):
    results = retriever.retrieve("anything", service="  PassPort ")
    assert {x.service_name for x in results} == {"passport"}


def test_no_service_or_empty_service_searches_everything(records):
    collection = _FakeCollection(records)
    r = Retriever(collection, _FakeModel())
    r.retrieve("anything", service=None)
    assert collection.last_query["where"] is None
    r.retrieve("anything", service="")
    assert collection.last_query["where"] is None


def test_unknown_service_raises_with_available_list(retriever):
    with pytest.raises(ValueError) as exc:
        retriever.retrieve("anything", service="driving-licence")
    assert "passport" in str(exc.value)


def test_missing_source_url_comes_back_as_none(retriever):
    results = retriever.retrieve("form 6", service="voter-id")
    assert results[0].source_url is None


def test_available_services_sorted_and_deduplicated(retriever):
    assert retriever.available_services() == ["aadhaar", "passport", "voter-id"]


# --- validation -----------------------------------------------------------------

@pytest.mark.parametrize("bad_query", ["", "   ", "\n\t"])
def test_empty_query_rejected(retriever, bad_query):
    with pytest.raises(ValueError):
        retriever.retrieve(bad_query)


def test_non_string_query_rejected(retriever):
    with pytest.raises(ValueError):
        retriever.retrieve(None)  # type: ignore[arg-type]


def test_overlong_query_rejected(retriever):
    with pytest.raises(ValueError):
        retriever.retrieve("a" * (MAX_QUERY_CHARS + 1))


@pytest.mark.parametrize("bad_k", [0, -1, 2.5, True])
def test_invalid_k_rejected(retriever, bad_k):
    with pytest.raises(ValueError):
        retriever.retrieve("anything", k=bad_k)  # type: ignore[arg-type]


def test_empty_collection_rejected():
    with pytest.raises(RuntimeError):
        Retriever(_FakeCollection([]), _FakeModel())
