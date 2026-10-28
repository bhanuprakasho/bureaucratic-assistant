"""
Step 4 - Persistent vector store (ChromaDB) wrapper.

Owns the one thing the rest of the indexing pipeline needs from Chroma:
a persistent collection that chunk embeddings + metadata get upserted
into. Kept separate from build_index.py / inspect_index.py so the same
collection-opening logic can be reused, unchanged, by the retrieval
stage (Step 5) later.

Design choices, both deliberate and worth knowing about downstream:
- The collection is created with `hnsw:space: cosine`, so distances
  returned by `collection.query()` are cosine distances (range 0-2),
  and `similarity = 1 - distance` (as used in the implementation guide's
  Step 5 retriever) is meaningful. Chroma's default space is squared L2,
  which would make that formula wrong, so this is set explicitly rather
  than left to the library default.
- `upsert` (not `add`) is used everywhere, keyed on `chunk_id`. Because
  chunk_ids are deterministic (see chunker.py), re-running indexing on
  an unchanged document set overwrites existing entries instead of
  duplicating them -- this is what makes build_index.py safe to re-run.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import chromadb

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

_COLLECTION_METADATA = {"hnsw:space": "cosine"}


def _sanitize_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    """Convert a chunk's metadata dict into Chroma-storable primitives.

    Chroma metadata values must be flat str/int/float/bool -- None and
    nested structures are rejected outright. This is purely a storage
    encoding step, not fabricating data: a genuinely unknown field (e.g.
    source_url=None because sources.json has no entry for that file)
    becomes "" here, not a made-up value. Anything reading this metadata
    back out (inspection, retrieval, attribution) should treat "" the
    same way None was treated in chunks.jsonl: "not available".
    """
    sanitized: dict[str, Any] = {}
    for key, value in metadata.items():
        if value is None:
            sanitized[key] = ""
        elif isinstance(value, (str, int, float, bool)):
            sanitized[key] = value
        else:
            sanitized[key] = str(value)
    return sanitized


def get_collection(persist_dir: Path, collection_name: str) -> "chromadb.Collection":
    """Open (creating if it doesn't exist yet) a persistent Chroma
    collection at persist_dir. Safe to call repeatedly across process
    runs -- this is what makes the vector store persistent."""
    persist_dir = Path(persist_dir)
    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))
    return client.get_or_create_collection(collection_name, metadata=_COLLECTION_METADATA)


def upsert_chunks(
    collection: "chromadb.Collection",
    chunk_ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict[str, Any]],
    batch_size: int = 64,
) -> int:
    """Upsert chunk embeddings + metadata into the collection in batches.

    Returns the number of chunk records upserted. Raises on a length
    mismatch between the four parallel lists rather than silently
    misaligning ids with the wrong vectors/metadata.
    """
    total = len(chunk_ids)
    if not (len(embeddings) == len(documents) == len(metadatas) == total):
        raise ValueError(
            "chunk_ids, embeddings, documents, and metadatas must all be "
            f"the same length (got {total}, {len(embeddings)}, "
            f"{len(documents)}, {len(metadatas)})"
        )
    if total == 0:
        return 0

    sanitized_metadatas = [_sanitize_metadata(m) for m in metadatas]

    written = 0
    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        collection.upsert(
            ids=chunk_ids[start:end],
            embeddings=embeddings[start:end],
            documents=documents[start:end],
            metadatas=sanitized_metadatas[start:end],
        )
        written += end - start

    return written
