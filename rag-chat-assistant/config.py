"""
Central configuration for the RAG Bureaucratic Assistant document
ingestion pipeline (Step 3: extraction, cleaning, chunking, metadata).

Every value here is a default and can be overridden via a command-line
flag on scripts/build_chunks.py -- nothing below should be treated as
final without tuning it once a retrieval phase exists to measure against.

Embedding/vector-store settings deliberately live outside this file --
they belong to the next phase (Knowledge Indexing), which this pipeline
stops short of.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Paths -----------------------------------------------------------------

PROJECT_ROOT: Path = Path(__file__).resolve().parent

# Root folder containing one sub-folder per government service, each
# holding that service's source PDFs (see README for the expected layout).
DOCUMENTS_DIR: Path = Path(os.environ.get("RAG_DOCUMENTS_DIR", PROJECT_ROOT / "documents"))

# Where processed chunks are written, one JSON object per line.
PROCESSED_DIR: Path = Path(os.environ.get("RAG_PROCESSED_DIR", PROJECT_ROOT / "data" / "processed"))
CHUNKS_OUTPUT_PATH: Path = PROCESSED_DIR / "chunks.jsonl"

# Manifest mapping each source PDF to its official government URL,
# used for citation/attribution (Step 9). See src/ingestion/source_manifest.py.
SOURCES_MANIFEST_PATH: Path = Path(
    os.environ.get("RAG_SOURCES_MANIFEST", PROJECT_ROOT / "data" / "sources.json")
)  

# --- Chunking ----------------------------------------------------------------

# Target chunk size and overlap, measured in characters (not tokens).
# Reasonable starting points for short, clause-heavy government text --
# not something to treat as universally optimal. Tune once a retrieval
# test set exists to measure Recall@k against.
CHUNK_SIZE: int = int(os.environ.get("RAG_CHUNK_SIZE", 1200))
CHUNK_OVERLAP: int = int(os.environ.get("RAG_CHUNK_OVERLAP", 150))

# Separators tried in order, most "structural" first. This is what makes
# the splitter "recursive": it only falls through to a finer-grained unit
# (sentence, then word, then raw characters) for pieces that don't fit.
CHUNK_SEPARATORS: list[str] = ["\n\n", "\n", ". ", " ", ""]

# --- Misc ----------------------------------------------------------------------

# Minimum number of non-whitespace characters a page needs to count as
# "has extractable text". Pages below this are logged as warnings and
# excluded from chunking (e.g. blank separator pages, scanned images).
MIN_PAGE_CHARS: int = 10

# --- Knowledge Indexing (Step 4) --------------------------------------------

# Pretrained sentence-embedding model used for both indexing (chunks)
# and, later, query-time retrieval (Step 5) -- must stay identical
# across both or similarity scores become meaningless.
EMBEDDING_MODEL_NAME: str = os.environ.get("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# Where the persistent Chroma collection is stored on disk.
VECTOR_STORE_DIR: Path = Path(
    os.environ.get("RAG_VECTOR_STORE_DIR", PROJECT_ROOT / "data" / "vector_store")
)
VECTOR_STORE_COLLECTION: str = os.environ.get("RAG_VECTOR_STORE_COLLECTION", "gov_docs")

# Batch size for both embedding generation and Chroma upsert calls.
EMBEDDING_BATCH_SIZE: int = int(os.environ.get("RAG_EMBEDDING_BATCH_SIZE", 64))