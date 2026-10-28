#!/usr/bin/env python3
"""
Read-only inspection of the Step 4 vector store.

Verifies that indexing succeeded: the persistent collection exists, its
count matches chunks.jsonl, metadata looks complete, and (optionally) a
smoke-test query returns topically plausible top results.

Note on the smoke-test query: this calls Chroma's raw `collection.query`
purely to verify the *indexing* stage worked end-to-end (per the Step 4
completion criteria in the implementation guide -- "manual smoke-test
queries return topically relevant top results"). It is NOT the
`retrieve()` function/API that Step 5 (Query Processing and Retrieval
Pipeline) will build -- no scoring thresholds, top-k tuning, or reusable
retrieval interface are implemented here.

Usage:
    python scripts/inspect_index.py
    python scripts/inspect_index.py --query "documents required for a passport"
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.indexing.embedder import embed_texts, load_embedding_model
from src.indexing.vector_store import get_collection
from src.processing.writer import read_chunks_jsonl


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect the persisted vector store (read-only).")
    parser.add_argument("--chunks-path", type=Path, default=config.CHUNKS_OUTPUT_PATH,
                         help="Step 3 chunks.jsonl, used only to cross-check the expected count.")
    parser.add_argument("--vector-store-dir", type=Path, default=config.VECTOR_STORE_DIR)
    parser.add_argument("--collection-name", type=str, default=config.VECTOR_STORE_COLLECTION)
    parser.add_argument("--embedding-model", type=str, default=config.EMBEDDING_MODEL_NAME)
    parser.add_argument("--query", type=str, default=None,
                         help="Optional smoke-test query (top 3 results shown). "
                              "Default: 'what documents are required'.")
    parser.add_argument("--no-query", action="store_true",
                         help="Skip the smoke-test query entirely (metadata/count checks only).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("\n" + "=" * 55)
    print("VECTOR STORE INSPECTION")
    print("=" * 55)
    print(f"Vector store path: {args.vector_store_dir}")
    print(f"Collection name:   {args.collection_name}")

    if not Path(args.vector_store_dir).exists():
        print("\nNo vector store found at that path.")
        print("Run scripts/build_index.py first.")
        return

    collection = get_collection(args.vector_store_dir, args.collection_name)
    count = collection.count()
    print(f"Indexed vectors:   {count}")

    if count == 0:
        print("\nThe collection is empty.")
        print("Run scripts/build_index.py first.")
        return

    # Cross-check against chunks.jsonl, if available.
    try:
        expected = len(list(read_chunks_jsonl(args.chunks_path)))
        match = "OK" if expected == count else "MISMATCH"
        print(f"chunks.jsonl count: {expected}  [{match}]")
    except FileNotFoundError:
        print(f"chunks.jsonl not found at {args.chunks_path} -- skipping count cross-check.")

    # Sample metadata to summarize services/files represented and spot-
    # check completeness (e.g. how many chunks have no source_url).
    sample = collection.get(limit=min(count, 1000), include=["metadatas"])
    metadatas = sample.get("metadatas", []) or []

    services = Counter(m.get("service_name", "?") for m in metadatas)
    missing_url = sum(1 for m in metadatas if not m.get("source_url"))

    print(f"\nServices indexed ({len(services)}):")
    for service, n in sorted(services.items()):
        print(f"  - {service}: {n} chunks")
    print(f"\nChunks with missing source_url: {missing_url} / {len(metadatas)}")

    if args.no_query:
        print("\n" + "=" * 55)
        return

    # Optional smoke-test query -- verification only (see module docstring).
    query_text = args.query or "what documents are required"
    print(f"\nSmoke-test query: {query_text!r}")
    model = load_embedding_model(args.embedding_model)
    query_embedding = embed_texts(model, [query_text])
    results = collection.query(query_embeddings=query_embedding, n_results=3)

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    for i, (doc, meta, dist) in enumerate(zip(docs, metas, dists), start=1):
        preview = (doc[:150] + "...") if len(doc) > 150 else doc
        similarity = 1 - dist  # meaningful because the collection uses cosine space
        print(f"\n  #{i} similarity~{similarity:.3f}  "
              f"[{meta.get('service_name')}/{meta.get('file_name')} "
              f"p.{meta.get('page_start')}-{meta.get('page_end')}]")
        print(f"     {preview!r}")

    print("\n" + "=" * 55)


if __name__ == "__main__":
    main()
