#!/usr/bin/env python3
"""
Try retrieval by hand (Step 5). Shows the top-k chunks with similarity
scores and provenance. Retrieval only -- no answer is generated.

Usage:
    # one-shot
    python scripts/search_chunks.py --query "how can a minor get a passport" --service passport

    # interactive: pick a service first, then keep asking questions
    python scripts/search_chunks.py

In interactive mode type  :service  to switch service, or  exit  to quit.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.retrieval.retriever import DEFAULT_TOP_K, Retriever, RetrievedChunk
from src.utils.logging_utils import configure_root_logging

PREVIEW_CHARS = 300


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search the indexed government documents (retrieval only).")
    parser.add_argument("--query", type=str, default=None,
                         help="Run a single query and exit. Omit for interactive mode.")
    parser.add_argument("--service", type=str, default=None,
                         help="Restrict search to one service (e.g. passport). Default: all services.")
    parser.add_argument("-k", "--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--vector-store-dir", type=Path, default=config.VECTOR_STORE_DIR)
    parser.add_argument("--collection-name", type=str, default=config.VECTOR_STORE_COLLECTION)
    parser.add_argument("--embedding-model", type=str, default=config.EMBEDDING_MODEL_NAME)
    return parser.parse_args()


def print_results(results: list[RetrievedChunk]) -> None:
    if not results:
        print("\n  (no results)")
        return
    for rank, r in enumerate(results, start=1):
        preview = r.text if len(r.text) <= PREVIEW_CHARS else r.text[:PREVIEW_CHARS] + "..."
        print(f"\n  #{rank}  similarity={r.similarity:.3f}  "
              f"[{r.service_name}/{r.file_name} p.{r.page_start}-{r.page_end}]")
        print(f"      chunk_id: {r.chunk_id}")
        print(f"      text:     {preview!r}")
        print(f"      url:      {r.source_url}")


def choose_service(retriever: Retriever) -> Optional[str]:
    services = retriever.available_services()
    print("\nAvailable services:")
    for i, name in enumerate(services, start=1):
        print(f"  {i}. {name}")
    print("  0. all services")
    lowered = {s.lower(): s for s in services}
    while True:
        choice = input("Choose a service (number or name, Enter for all): ").strip().lower()
        if choice in ("", "0", "all"):
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(services):
            return services[int(choice) - 1]
        if choice in lowered:
            return lowered[choice]
        print("Not a valid choice, try again.")


def run_once(retriever: Retriever, query: str, k: int, service: Optional[str]) -> None:
    print(f"\nQuery:   {query!r}")
    print(f"Service: {service or 'all'}   top-k: {k}")
    print_results(retriever.retrieve(query, k=k, service=service))


def interactive(retriever: Retriever, k: int, service: Optional[str]) -> None:
    if service is None:
        service = choose_service(retriever)
    print(f"\nSearching in: {service or 'all services'}. "
          "Type ':service' to switch, 'exit' to quit.")
    while True:
        try:
            query = input("\nQuery> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if query.lower() in ("exit", "quit"):
            return
        if query == ":service":
            service = choose_service(retriever)
            print(f"\nSearching in: {service or 'all services'}.")
            continue
        try:
            print_results(retriever.retrieve(query, k=k, service=service))
        except ValueError as exc:
            print(f"  {exc}")


def main() -> int:
    configure_root_logging(logging.WARNING)
    args = parse_args()

    try:
        retriever = Retriever.from_config(
            vector_store_dir=args.vector_store_dir,
            collection_name=args.collection_name,
            embedding_model=args.embedding_model,
        )
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"\n{exc}")
        return 1

    try:
        if args.query:
            run_once(retriever, args.query, args.top_k, args.service)
        else:
            interactive(retriever, args.top_k, args.service)
    except ValueError as exc:
        print(f"\n{exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
