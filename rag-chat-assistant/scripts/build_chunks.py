#!/usr/bin/env python3
"""
Orchestrates Step 3 (Document Ingestion) end-to-end:

    discover PDFs -> extract text -> clean text -> chunk -> attach
    metadata -> write data/processed/chunks.jsonl

This is the current stopping point: no embeddings are generated and
nothing is indexed into a vector database. That's the next phase.

Usage:
    python scripts/build_chunks.py
    python scripts/build_chunks.py --documents-dir documents --chunk-size 800
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.ingestion.pdf_loader import PageRecord, discover_pdfs, load_pdf_pages
from src.ingestion.source_manifest import load_source_manifest  
from src.processing.chunker import Chunk, chunk_document
from src.processing.cleaner import clean_text
from src.processing.writer import write_chunks_jsonl
from src.utils.logging_utils import configure_root_logging, get_logger

logger = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest, clean, and chunk the government-service PDFs.")
    parser.add_argument("--documents-dir", type=Path, default=config.DOCUMENTS_DIR,
                         help="Root folder with one sub-folder per government service.")
    parser.add_argument("--output-path", type=Path, default=config.CHUNKS_OUTPUT_PATH,
                         help="Where to write the resulting chunks.jsonl file.")
    parser.add_argument("--sources-manifest", type=Path, default=config.SOURCES_MANIFEST_PATH, 
                         help="Path to the JSON manifest mapping PDFs to their official URLs.")
    parser.add_argument("--chunk-size", type=int, default=config.CHUNK_SIZE)
    parser.add_argument("--chunk-overlap", type=int, default=config.CHUNK_OVERLAP)
    return parser.parse_args()


def _clean_pages_in_place(pages: list[PageRecord]) -> None:
    """Clean each page's text conservatively, keeping all other fields
    (page number, service, metadata) untouched."""
    for page in pages:
        page.text = clean_text(page.text)


def main() -> None:
    configure_root_logging()
    args = parse_args()

    stats = {
        "services": set(),
        "pdfs_discovered": 0,
        "pdfs_failed": 0,
        "pages_processed": 0,
        "extraction_warnings": 0,
        "chunks_created": 0,
        "chunks_written": 0,
    }

    logger.info("Discovering PDFs under %s ...", args.documents_dir)
    pdf_paths = discover_pdfs(args.documents_dir)
    stats["pdfs_discovered"] = len(pdf_paths)

    if not pdf_paths:
        logger.warning("Nothing to process. Add PDFs under %s and re-run.", args.documents_dir)
        _print_summary(stats, args.output_path)
        return

    logger.info("Loading source URL manifest from %s ...", args.sources_manifest)      # <-- new
    source_manifest = load_source_manifest(args.sources_manifest)                       # <-- new

    all_chunks: list[Chunk] = []

    for pdf_path in pdf_paths:
        result = load_pdf_pages(pdf_path, args.documents_dir, source_manifest)  
        stats["services"].add(result.service_name)

        if result.fatal_error:
            logger.error("Skipping unreadable PDF %s: %s", pdf_path, result.fatal_error)
            stats["pdfs_failed"] += 1
            continue

        stats["pages_processed"] += len(result.pages)
        stats["extraction_warnings"] += sum(1 for p in result.pages if not p.has_text)

        _clean_pages_in_place(result.pages)

        file_chunks = chunk_document(
            result.pages,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
        )
        logger.info("%s/%s: %d pages -> %d chunks",
                     result.service_name, result.file_name, len(result.pages), len(file_chunks))
        all_chunks.extend(file_chunks)

    stats["chunks_created"] = len(all_chunks)

    if not all_chunks:
        logger.warning("No chunks were produced (no extractable text found anywhere).")
        _print_summary(stats, args.output_path)
        return

    try:
        written = write_chunks_jsonl(all_chunks, args.output_path)
    except OSError:
        logger.error("Aborting: could not write output file.")
        _print_summary(stats, args.output_path)
        return

    stats["chunks_written"] = written
    _print_summary(stats, args.output_path)


def _print_summary(stats: dict, output_path: Path) -> None:
    print("\n" + "=" * 55)
    print("DOCUMENT INGESTION SUMMARY")
    print("=" * 55)
    print(f"Services discovered:   {len(stats['services'])} {sorted(stats['services'])}")
    print(f"PDFs discovered:       {stats['pdfs_discovered']}")
    print(f"PDFs failed to open:   {stats['pdfs_failed']}")
    print(f"Pages processed:       {stats['pages_processed']}")
    print(f"Extraction warnings:   {stats['extraction_warnings']} (pages with no usable text)")
    print(f"Chunks created:        {stats['chunks_created']}")
    print(f"Chunks written:        {stats['chunks_written']}")
    print(f"Output file:           {output_path}")
    print("=" * 55)


if __name__ == "__main__":
    start = time.time()
    main()
    logger.info("Done in %.1fs", time.time() - start)
