"""
Generic recursive text chunking.

Turns cleaned page text into overlapping chunks sized for embedding,
while keeping track of which original page(s) each chunk came from.

Chunking works on a whole *document* (all pages of one PDF, concatenated)
rather than page-by-page, so a rule split across a page boundary can
still end up in a single chunk. Page provenance is recovered afterwards
by locating each chunk's text back inside the concatenated document text.

The splitter is "recursive" in the LangChain sense: it tries the most
structural separator first (paragraph breaks), and only falls through to
a finer-grained separator (line, sentence, word, then raw characters)
for pieces that are still too large after a coarser split.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from src.ingestion.pdf_loader import PageRecord
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@dataclass
class Chunk:
    """One chunk of text, ready for embedding + indexing."""

    chunk_id: str
    text: str
    service_name: str
    file_name: str
    file_path: str
    page_start: int
    page_end: int
    chunk_index: int          # 0-indexed position within the file
    char_count: int
    pdf_title: Optional[str] = None
    pdf_author: Optional[str] = None
    source_url: Optional[str] = None 


# --- Recursive splitting ----------------------------------------------------

def _merge_splits(splits: list[str], separator: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Greedily pack small splits into chunks up to chunk_size, carrying
    a small overlap from the tail of one chunk into the start of the
    next so a rule near a chunk boundary isn't lost entirely."""
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    sep_len = len(separator)

    for split in splits:
        split_len = len(split)
        extra = sep_len if current else 0
        if current and current_len + extra + split_len > chunk_size:
            chunks.append(separator.join(current))

            # Build the overlap for the next chunk from the tail of this one.
            overlap: list[str] = []
            overlap_len = 0
            for piece in reversed(current):
                piece_len = len(piece) + (sep_len if overlap else 0)
                if overlap_len + piece_len > chunk_overlap:
                    break
                overlap.insert(0, piece)
                overlap_len += piece_len
            current = overlap
            current_len = sum(len(p) for p in current) + sep_len * max(0, len(current) - 1)

        current.append(split)
        current_len += split_len + (sep_len if len(current) > 1 else 0)

    if current:
        chunks.append(separator.join(current))
    return chunks


def _split_text(text: str, separators: list[str], chunk_size: int, chunk_overlap: int) -> list[str]:
    """Recursively split `text`, trying each separator in order and only
    falling through to a finer-grained separator for pieces that are
    still too big after splitting on the current one."""
    if not text:
        return []

    separator = separators[0]
    remaining = separators[1:]
    splits = list(text) if separator == "" else text.split(separator)

    final_splits: list[str] = []
    for piece in splits:
        if len(piece) <= chunk_size:
            final_splits.append(piece)
        elif remaining:
            final_splits.extend(_split_text(piece, remaining, chunk_size, chunk_overlap))
        else:
            # Raw-character split and still oversized shouldn't happen by
            # construction, but guard defensively with a hard cut.
            for i in range(0, len(piece), chunk_size):
                final_splits.append(piece[i:i + chunk_size])

    return _merge_splits(final_splits, separator, chunk_size, chunk_overlap)


def split_text(text: str, chunk_size: int, chunk_overlap: int,
               separators: Optional[list[str]] = None) -> list[str]:
    """Public entry point: split arbitrary text into overlapping chunks."""
    separators = separators or DEFAULT_SEPARATORS
    raw_chunks = _split_text(text, separators, chunk_size, chunk_overlap)
    return [c.strip() for c in raw_chunks if c.strip()]


# --- Page-boundary tracking --------------------------------------------------

def _build_document_text(pages: list[PageRecord]) -> tuple[str, list[tuple[int, int, int]]]:
    """Concatenate page texts into one document string, and record the
    (page_number, start_offset, end_offset) span of each page within it.
    Pages with no usable text are skipped (they contribute nothing to
    embed, but are still counted in the caller's page-processed stats)."""
    doc_parts: list[str] = []
    page_spans: list[tuple[int, int, int]] = []
    cursor = 0

    for page in pages:
        if not page.has_text or not page.text.strip():
            continue
        start = cursor
        doc_parts.append(page.text)
        cursor += len(page.text)
        page_spans.append((page.page_number, start, cursor))
        doc_parts.append("\n\n")  # separator between pages, counted in the cursor too
        cursor += 2

    return "".join(doc_parts), page_spans


def _page_for_offset(offset: int, page_spans: list[tuple[int, int, int]]) -> int:
    """Which page number a character offset in the concatenated document
    text falls into. Falls back to the nearest known page rather than
    crashing if the offset lands outside every span (e.g. in an
    inter-page separator)."""
    for page_number, start, end in page_spans:
        if start <= offset < end:
            return page_number
    if not page_spans:
        return 0
    if offset < page_spans[0][1]:
        return page_spans[0][0]
    return page_spans[-1][0]


def _locate_chunk(chunk_text: str, doc_text: str, search_from: int) -> int:
    """Find where a chunk's text starts in the full document text.
    Chunks are produced in order, so search forward from a rolling
    pointer first (with a little backtrack to tolerate overlap), then
    fall back to a full-text search."""
    idx = doc_text.find(chunk_text, max(0, search_from - 200))
    if idx == -1:
        idx = doc_text.find(chunk_text)
    if idx == -1:
        # Defensive fallback only -- the splitter only ever produces
        # substrings of doc_text (modulo the .strip() in split_text()).
        idx = search_from
    return idx


# --- Public API --------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-zA-Z0-9]+")


def _slugify(value: str) -> str:
    value = _SLUG_RE.sub("_", value).strip("_")
    return value.lower() or "file"


def chunk_document(
    pages: list[PageRecord],
    chunk_size: int = 1200,
    chunk_overlap: int = 150,
    separators: Optional[list[str]] = None,
) -> list[Chunk]:
    """Chunk every page of one PDF file into overlapping, page-attributed
    Chunk objects. `pages` must all belong to the same file.

    Chunk IDs are deterministic: {service}_{file_stem}_p{page_start}_c{n},
    built purely from the file's own content and a sequential counter, so
    re-running the pipeline on an unchanged document set reproduces the
    exact same IDs (needed for the upsert-based indexing in Step 4).
    """
    if not pages:
        return []

    service_name = pages[0].service_name
    file_name = pages[0].file_name
    file_path = pages[0].file_path
    pdf_title = pages[0].pdf_title
    pdf_author = pages[0].pdf_author
    source_url = pages[0].source_url  

    doc_text, page_spans = _build_document_text(pages)
    if not doc_text.strip():
        logger.warning("No extractable text at all for %s -- 0 chunks produced", file_name)
        return []

    raw_chunks = split_text(doc_text, chunk_size, chunk_overlap, separators)

    file_stem = _slugify(file_name.rsplit(".", 1)[0])
    service_slug = _slugify(service_name)

    chunks: list[Chunk] = []
    search_from = 0
    for i, chunk_text in enumerate(raw_chunks):
        start_offset = _locate_chunk(chunk_text, doc_text, search_from)
        end_offset = start_offset + len(chunk_text)
        search_from = start_offset + 1  # lets the next (overlapping) chunk be found again

        page_start = _page_for_offset(start_offset, page_spans)
        page_end = _page_for_offset(max(start_offset, end_offset - 1), page_spans)

        chunk_id = f"{service_slug}_{file_stem}_p{page_start:03d}_c{i + 1:03d}"

        chunks.append(Chunk(
            chunk_id=chunk_id,
            text=chunk_text,
            service_name=service_name,
            file_name=file_name,
            file_path=file_path,
            page_start=page_start,
            page_end=page_end,
            chunk_index=i,
            char_count=len(chunk_text),
            pdf_title=pdf_title,
            pdf_author=pdf_author,
            source_url=source_url, 
        ))

    return chunks
