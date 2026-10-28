#!/usr/bin/env python3
"""
Read-only inspection of data/processed/chunks.jsonl.

Lets you sanity-check the output of Step 3 (ingestion/cleaning/chunking/
metadata) before moving on to embeddings and indexing.

Usage:
    python scripts/inspect_chunks.py
    python scripts/inspect_chunks.py --sample-size 5
"""

from __future__ import annotations

import argparse
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.processing.writer import read_chunks_jsonl


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect the processed chunks file (read-only).")
    parser.add_argument("--input-path", type=Path, default=config.CHUNKS_OUTPUT_PATH)
    parser.add_argument("--sample-size", type=int, default=3)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        records = list(read_chunks_jsonl(args.input_path))
    except FileNotFoundError:
        print(f"\nNo processed chunks found at {args.input_path}.")
        print("Run scripts/build_chunks.py first.")
        return

    print("\n" + "=" * 55)
    print("PROCESSED CHUNKS INSPECTION")
    print("=" * 55)
    print(f"File:            {args.input_path}")
    print(f"Total chunks:    {len(records)}")

    if not records:
        print("\nThe file is empty.")
        return

    services = Counter(r.get("service_name", "?") for r in records)
    files = Counter(f"{r.get('service_name', '?')}/{r.get('file_name', '?')}" for r in records)
    char_counts = [r.get("char_count", len(r.get("text", ""))) for r in records]

    print(f"\nServices represented ({len(services)}):")
    for service, count in sorted(services.items()):
        print(f"  - {service}: {count} chunks")

    print(f"\nSource PDFs represented ({len(files)}):")
    for file_key, count in sorted(files.items()):
        print(f"  - {file_key}: {count} chunks")

    print("\nChunk size (characters):")
    print(f"  min:    {min(char_counts)}")
    print(f"  max:    {max(char_counts)}")
    print(f"  mean:   {statistics.mean(char_counts):.0f}")
    print(f"  median: {statistics.median(char_counts):.0f}")

    print(f"\nSample chunks ({min(args.sample_size, len(records))}):")
    for record in records[: args.sample_size]:
        text = record.get("text", "")
        preview = (text[:200] + "...") if len(text) > 200 else text
        print(f"\n  chunk_id:   {record.get('chunk_id')}")
        print(f"  service:    {record.get('service_name')}")
        print(f"  file:       {record.get('file_name')}")
        print(f"  pages:      {record.get('page_start')}-{record.get('page_end')}")
        print(f"  pdf_title:  {record.get('pdf_title')}")
        print(f"  pdf_author: {record.get('pdf_author')}")
        print(f"  text:       {preview!r}")
        print(f"  source_url: {record.get('source_url')}")

    print("\n" + "=" * 55)


if __name__ == "__main__":
    main()
