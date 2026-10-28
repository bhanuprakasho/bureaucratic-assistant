"""
Persist processed chunks to / read them back from a JSONL file.

This is the Step 3 deliverable format (`data/processed/chunks.jsonl`):
one JSON object per line, one line per chunk, carrying the chunk text
and its full provenance metadata (service, file, page range, PDF
title/author). The next phase (embedding + indexing) is expected to
consume this file directly rather than re-running extraction, cleaning,
or chunking itself.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterator

from src.processing.chunker import Chunk
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def write_chunks_jsonl(chunks: list[Chunk], output_path: Path) -> int:
    """Write chunks to a JSONL file, one JSON object per line.

    Overwrites any existing file at output_path -- this pipeline is
    designed to be re-run from scratch over the full documents/ tree
    each time (e.g. after adding a new service's PDFs), not to append
    incrementally.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    try:
        with output_path.open("w", encoding="utf-8") as f:
            for chunk in chunks:
                f.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")
                written += 1
    except OSError as exc:
        logger.error("Failed to write chunks to %s: %s", output_path, exc)
        raise

    return written


def read_chunks_jsonl(input_path: Path) -> Iterator[dict]:
    """Read chunk records back from a JSONL file, yielding plain dicts.

    Used by the inspection script, and by whatever consumes this file
    next (embedding/indexing). Malformed lines are logged and skipped
    rather than aborting the whole read.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"No processed chunks file found at {input_path}")

    with input_path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                logger.warning("Skipping malformed line %d in %s: %s", line_number, input_path, exc)
