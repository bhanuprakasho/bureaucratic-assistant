"""
Step 5 - Query processing and retrieval.

Takes a raw user query, embeds it with the SAME model that was used to
index the chunks (Step 4), and returns the top-k most similar chunks
from the persistent Chroma collection, together with their similarity
scores and provenance metadata.

This module is pure retrieval:
- no scope / sufficiency decision (that is Step 6, which consumes the
  `similarity` values returned here),
- no LLM call,
- no reasoning, generation or source-attribution formatting.

Design notes
------------
- `Retriever` loads the embedding model and opens the collection ONCE
  and is then reused for every query. A frontend should create one
  Retriever at start-up and call `.retrieve(...)` per request.
- `service` is an optional filter. A frontend where the user first
  picks a service (passport, aadhaar, ...) passes that name here; the
  search then runs only over that service's chunks. Use
  `available_services()` to populate the service picker.
- `similarity = 1 - cosine_distance`. This is only meaningful because
  vector_store.py creates the collection with `hnsw:space = cosine`.
  It is NOT a probability; Step 6 calibrates thresholds on it.
- Metadata stored by Step 4 uses "" for unknown values (Chroma cannot
  store None). They are converted back to None here so callers can
  treat "not available" uniformly.
- There is no `section` field: Step 3 does not produce one, so it is
  not invented here.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

import config
from src.indexing.embedder import embed_texts, load_embedding_model
from src.indexing.vector_store import get_collection
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Guide recommends 4-6 chunks: enough context, not too much dilution.
DEFAULT_TOP_K = 5

# Basic guard against absurd input (pasted documents, etc.).
MAX_QUERY_CHARS = 1000

# Page size when scanning collection metadata (service list / counts).
_SCAN_PAGE_SIZE = 500


@dataclass
class RetrievedChunk:
    """One retrieved chunk with its score and full provenance."""

    chunk_id: str
    text: str
    similarity: float                 # 1 - cosine distance (higher = closer)
    distance: float                   # raw cosine distance from Chroma
    service_name: Optional[str] = None
    file_name: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    source_url: Optional[str] = None
    pdf_title: Optional[str] = None
    pdf_author: Optional[str] = None
    file_path: Optional[str] = None
    chunk_index: Optional[int] = None
    char_count: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        """Plain dict, e.g. for JSON responses from a frontend backend."""
        return asdict(self)


def _blank_to_none(value: Any) -> Any:
    """Undo Step 4's storage encoding: "" (or None) means 'not available'."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def build_retrieved_chunk(
    chunk_id: str,
    text: str,
    metadata: Optional[dict[str, Any]],
    distance: float,
) -> RetrievedChunk:
    """Turn one raw Chroma result row into a RetrievedChunk."""
    meta = metadata or {}
    return RetrievedChunk(
        chunk_id=chunk_id,
        text=text,
        similarity=1.0 - distance,
        distance=distance,
        service_name=_blank_to_none(meta.get("service_name")),
        file_name=_blank_to_none(meta.get("file_name")),
        page_start=_blank_to_none(meta.get("page_start")),
        page_end=_blank_to_none(meta.get("page_end")),
        source_url=_blank_to_none(meta.get("source_url")),
        pdf_title=_blank_to_none(meta.get("pdf_title")),
        pdf_author=_blank_to_none(meta.get("pdf_author")),
        file_path=_blank_to_none(meta.get("file_path")),
        chunk_index=_blank_to_none(meta.get("chunk_index")),
        char_count=_blank_to_none(meta.get("char_count")),
    )


class Retriever:
    """Embeds queries and searches the persistent vector store.

    Takes an already-opened collection and an already-loaded embedding
    model (dependency injection keeps it unit-testable without
    downloading a model). Use `Retriever.from_config()` in real code.
    """

    def __init__(self, collection: Any, model: Any, default_k: int = DEFAULT_TOP_K):
        if collection.count() == 0:
            raise RuntimeError(
                "The vector store is empty. Run scripts/build_index.py first."
            )
        self._collection = collection
        self._model = model
        self._default_k = default_k
        self._service_counts: Optional[dict[str, int]] = None

    # -- construction ---------------------------------------------------

    @classmethod
    def from_config(
        cls,
        vector_store_dir: Optional[Path] = None,
        collection_name: Optional[str] = None,
        embedding_model: Optional[str] = None,
    ) -> "Retriever":
        """Open the persisted store and embedding model named in config.py.

        The model name defaults to config.EMBEDDING_MODEL_NAME, which is
        the same value build_index.py uses -- keeping index-time and
        query-time embeddings identical.
        """
        store_dir = Path(vector_store_dir or config.VECTOR_STORE_DIR)
        if not store_dir.exists():
            raise FileNotFoundError(
                f"No vector store found at {store_dir}. "
                "Run scripts/build_index.py first."
            )
        collection = get_collection(
            store_dir, collection_name or config.VECTOR_STORE_COLLECTION
        )
        model = load_embedding_model(embedding_model or config.EMBEDDING_MODEL_NAME)
        return cls(collection, model)

    # -- service information (for a frontend's service picker) ----------

    def _load_service_counts(self) -> dict[str, int]:
        """Scan collection metadata once and cache {service: chunk_count}."""
        if self._service_counts is None:
            counts: Counter[str] = Counter()
            offset = 0
            while True:
                page = self._collection.get(
                    limit=_SCAN_PAGE_SIZE, offset=offset, include=["metadatas"]
                )
                metadatas = page.get("metadatas") or []
                if not metadatas:
                    break
                counts.update(m.get("service_name") or "" for m in metadatas)
                offset += len(metadatas)
                if len(metadatas) < _SCAN_PAGE_SIZE:
                    break
            counts.pop("", None)
            self._service_counts = dict(counts)
        return self._service_counts

    def available_services(self) -> list[str]:
        """Sorted service names present in the index."""
        return sorted(self._load_service_counts())

    def refresh(self) -> None:
        """Forget cached service info (call after re-running build_index.py
        while a long-lived process, e.g. a web app, is still running)."""
        self._service_counts = None

    def _resolve_service(self, service: Optional[str]) -> Optional[str]:
        """Map user input to the exact stored service name (case-insensitive).
        None or an empty string means 'search all services'."""
        if service is None:
            return None
        wanted = service.strip().lower()
        if not wanted:
            return None
        for name in self._load_service_counts():
            if name.lower() == wanted:
                return name
        raise ValueError(
            f"Unknown service {service!r}. "
            f"Available services: {self.available_services()}"
        )

    # -- validation -------------------------------------------------------

    @staticmethod
    def _validate_query(query: str) -> str:
        if not isinstance(query, str):
            raise ValueError("Query must be a string.")
        query = query.strip()
        if not query:
            raise ValueError("Query is empty.")
        if len(query) > MAX_QUERY_CHARS:
            raise ValueError(
                f"Query is too long ({len(query)} characters; "
                f"maximum is {MAX_QUERY_CHARS})."
            )
        return query

    @staticmethod
    def _validate_k(k: int) -> int:
        if isinstance(k, bool) or not isinstance(k, int) or k < 1:
            raise ValueError(f"k must be a positive integer (got {k!r}).")
        return k

    # -- retrieval ----------------------------------------------------------

    def retrieve(
        self,
        query: str,
        k: Optional[int] = None,
        service: Optional[str] = None,
    ) -> list[RetrievedChunk]:
        """Return the top-k chunks for `query`, best match first.

        - `service`: optionally restrict the search to one service.
        - Returns fewer than k results only if fewer chunks exist in the
          searched scope. Never invents or pads results.
        - Does NOT decide whether the results are good enough to answer
          with -- that is Step 6's job.
        """
        query = self._validate_query(query)
        k = self._validate_k(self._default_k if k is None else k)
        service_name = self._resolve_service(service)

        counts = self._load_service_counts()
        scope_size = counts[service_name] if service_name else sum(counts.values())
        n_results = min(k, scope_size)

        query_embedding = embed_texts(self._model, [query])

        query_kwargs: dict[str, Any] = {
            "query_embeddings": query_embedding,
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if service_name:
            query_kwargs["where"] = {"service_name": service_name}

        raw = self._collection.query(**query_kwargs)

        ids = (raw.get("ids") or [[]])[0]
        documents = (raw.get("documents") or [[]])[0]
        metadatas = (raw.get("metadatas") or [[]])[0]
        distances = (raw.get("distances") or [[]])[0]

        return [
            build_retrieved_chunk(cid, doc, meta, dist)
            for cid, doc, meta, dist in zip(ids, documents, metadatas, distances)
        ]


# --- Module-level convenience API -------------------------------------------
# Mirrors the `retrieve(query, k)` signature from the implementation guide.
# The default Retriever is created lazily on first use and then reused.

_default_retriever: Optional[Retriever] = None


def get_default_retriever() -> Retriever:
    global _default_retriever
    if _default_retriever is None:
        _default_retriever = Retriever.from_config()
    return _default_retriever


def retrieve(
    query: str,
    k: int = DEFAULT_TOP_K,
    service: Optional[str] = None,
) -> list[RetrievedChunk]:
    """Convenience wrapper around the shared default Retriever."""
    return get_default_retriever().retrieve(query, k=k, service=service)


def available_services() -> list[str]:
    """Convenience wrapper: services present in the index."""
    return get_default_retriever().available_services()
