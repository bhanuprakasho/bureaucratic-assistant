#!/usr/bin/env python3
"""
Orchestrates Step 4 (Knowledge Indexing) end-to-end:

    read data/processed/chunks.jsonl -> embed chunk text -> upsert
    (embedding + full metadata) into a persistent ChromaDB collection.

Consumes the Step 3 output file directly and does not re-run
extraction, cleaning, or chunking -- if chunks.jsonl is stale, re-run
scripts/build_chunks.py first.

Re-running this script is safe and idempotent: chunk_ids are
deterministic (see src/processing/chunker.py) and upsert overwrites
existing entries by id rather than duplicating them, so it's fine to
re-run after adding a new service's documents without clearing the
store first.

Usage:
    python scripts/build_index.py
    python scripts/build_index.py --chunks-path data/processed/chunks.jsonl
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.indexing.embedder import embed_texts, load_embedding_model
from src.indexing.vector_store import get_collection, upsert_chunks
from src.processing.writer import read_chunks_jsonl
from src.utils.logging_utils import configure_root_logging, get_logger

logger = get_logger(__name__)

# Every Chunk field except "text" (-> Chroma "document") and "chunk_id"
# (-> Chroma "id") is carried through as metadata. Mirrors the Chunk
# dataclass in src/processing/chunker.py exactly -- update this list if
# that dataclass changes. Note: there is no "section" field yet, because
# Step 3 doesn't produce one; it's simply omitted rather than invented.
METADATA_FIELDS = [
    "service_name",
    "file_name",
    "file_path",
    "page_start",
    "page_end",
    "chunk_index",
    "char_count",
    "pdf_title",
    "pdf_author",
    "source_url",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Embed chunks.jsonl and index it into ChromaDB.")
    parser.add_argument("--chunks-path", type=Path, default=config.CHUNKS_OUTPUT_PATH,
                         help="Path to the Step 3 chunks.jsonl file to index.")
    parser.add_argument("--vector-store-dir", type=Path, default=config.VECTOR_STORE_DIR,
                         help="Directory where the persistent Chroma collection is stored.")
    parser.add_argument("--collection-name", type=str, default=config.VECTOR_STORE_COLLECTION)
    parser.add_argument("--embedding-model", type=str, default=config.EMBEDDING_MODEL_NAME)
    parser.add_argument("--batch-size", type=int, default=config.EMBEDDING_BATCH_SIZE)
    return parser.parse_args()


def main() -> None:
    configure_root_logging()
    args = parse_args()

    stats = {
        "chunks_read": 0,
        "chunks_skipped_empty": 0,
        "chunks_missing_url": 0,
        "chunks_embedded": 0,
        "chunks_upserted": 0,
    }

    logger.info("Reading chunks from %s ...", args.chunks_path)
    try:
        records = list(read_chunks_jsonl(args.chunks_path))
    except FileNotFoundError as exc:
        logger.error("%s -- run scripts/build_chunks.py first.", exc)
        _print_summary(stats, args)
        return

    stats["chunks_read"] = len(records)
    if not records:
        logger.warning("No chunks found in %s -- nothing to index.", args.chunks_path)
        _print_summary(stats, args)
        return

    # Defensive filter: Step 3 shouldn't produce empty-text chunks, but
    # embedding an empty string is meaningless and would just pollute
    # the index, so guard against it here rather than trusting silently.
    usable = [r for r in records if r.get("text", "").strip()]
    stats["chunks_skipped_empty"] = len(records) - len(usable)
    stats["chunks_missing_url"] = sum(1 for r in usable if not r.get("source_url"))

    if not usable:
        logger.warning("No chunks with non-empty text -- nothing to index.")
        _print_summary(stats, args)
        return

    chunk_ids = [r["chunk_id"] for r in usable]
    texts = [r["text"] for r in usable]
    metadatas = [{field: r.get(field) for field in METADATA_FIELDS} for r in usable]

    logger.info("Loading embedding model %r ...", args.embedding_model)
    model = load_embedding_model(args.embedding_model)

    logger.info("Embedding %d chunks ...", len(texts))
    embeddings = embed_texts(model, texts, batch_size=args.batch_size)
    stats["chunks_embedded"] = len(embeddings)

    logger.info("Opening persistent Chroma collection %r at %s ...",
                 args.collection_name, args.vector_store_dir)
    collection = get_collection(args.vector_store_dir, args.collection_name)

    logger.info("Upserting %d chunks into the vector store ...", len(chunk_ids))
    written = upsert_chunks(
        collection,
        chunk_ids=chunk_ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
        batch_size=args.batch_size,
    )
    stats["chunks_upserted"] = written
    stats["collection_count"] = collection.count()

    _print_summary(stats, args)


def _print_summary(stats: dict, args: argparse.Namespace) -> None:
    print("\n" + "=" * 55)
    print("KNOWLEDGE INDEXING SUMMARY")
    print("=" * 55)
    print(f"Chunks read:            {stats['chunks_read']}")
    print(f"Chunks skipped (empty): {stats.get('chunks_skipped_empty', 0)}")
    print(f"Chunks missing URL:     {stats.get('chunks_missing_url', 0)} (indexed anyway, source_url='')")
    print(f"Chunks embedded:        {stats.get('chunks_embedded', 0)}")
    print(f"Chunks upserted:        {stats.get('chunks_upserted', 0)}")
    if "collection_count" in stats:
        print(f"Vector store count:     {stats['collection_count']}")
    print(f"Embedding model:        {args.embedding_model}")
    print(f"Vector store path:      {args.vector_store_dir}")
    print(f"Collection name:        {args.collection_name}")
    print("=" * 55)


if __name__ == "__main__":
    start = time.time()
    main()
    logger.info("Done in %.1fs", time.time() - start)
