"""
Tests for src/indexing/vector_store.py.

Deliberately limited to the pure-logic pieces (metadata sanitization,
batching, length validation) that don't require downloading an
embedding model or writing to disk. End-to-end indexing is verified
manually via scripts/inspect_index.py per the Step 4 completion
criteria, not via an automated test here.
"""

from __future__ import annotations

import pytest

from src.indexing.vector_store import _sanitize_metadata, upsert_chunks


def test_sanitize_metadata_converts_none_to_empty_string():
    result = _sanitize_metadata({"source_url": None, "pdf_title": None})
    assert result == {"source_url": "", "pdf_title": ""}


def test_sanitize_metadata_keeps_flat_primitives_unchanged():
    result = _sanitize_metadata({
        "service_name": "passport",
        "page_start": 3,
        "char_count": 512,
        "is_sample": True,
    })
    assert result == {
        "service_name": "passport",
        "page_start": 3,
        "char_count": 512,
        "is_sample": True,
    }


def test_sanitize_metadata_stringifies_unsupported_types():
    result = _sanitize_metadata({"weird": ["nested", "list"]})
    assert result == {"weird": "['nested', 'list']"}


class _FakeCollection:
    """Minimal stand-in for a chromadb.Collection, just enough to
    exercise upsert_chunks' batching without needing a real Chroma
    instance or network access."""

    def __init__(self):
        self.calls: list[dict] = []

    def upsert(self, ids, embeddings, documents, metadatas):
        self.calls.append({
            "ids": ids, "embeddings": embeddings,
            "documents": documents, "metadatas": metadatas,
        })


def test_upsert_chunks_batches_correctly():
    collection = _FakeCollection()
    n = 5
    written = upsert_chunks(
        collection,
        chunk_ids=[f"id{i}" for i in range(n)],
        embeddings=[[0.1, 0.2] for _ in range(n)],
        documents=[f"text{i}" for i in range(n)],
        metadatas=[{"source_url": None} for _ in range(n)],
        batch_size=2,
    )
    assert written == n
    assert len(collection.calls) == 3  # batches of 2, 2, 1
    # None must never reach the fake "Chroma" call.
    assert all(m["source_url"] == "" for call in collection.calls for m in call["metadatas"])


def test_upsert_chunks_rejects_mismatched_lengths():
    collection = _FakeCollection()
    with pytest.raises(ValueError):
        upsert_chunks(
            collection,
            chunk_ids=["id1", "id2"],
            embeddings=[[0.1, 0.2]],
            documents=["text1", "text2"],
            metadatas=[{}, {}],
        )


def test_upsert_chunks_empty_input_is_a_noop():
    collection = _FakeCollection()
    written = upsert_chunks(collection, [], [], [], [])
    assert written == 0
    assert collection.calls == []
