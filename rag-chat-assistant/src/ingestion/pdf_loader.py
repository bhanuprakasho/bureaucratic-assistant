"""
Step 1 - PDF ingestion.

Discovers PDFs under a documents/ directory (one immediate sub-folder per
government service), and extracts text page-by-page using PyMuPDF, while
preserving enough provenance (service, file, page number, PDF metadata)
for later citation.

This module is deliberately generic: it makes no assumption about a
PDF's internal structure, headings, layout, or content type. It only
extracts raw text per page -- anything structure-aware belongs in the
cleaning / chunking stages, not here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pymupdf as fitz  # PyMuPDF (the `fitz` import name is deprecated upstream)

from config import MIN_PAGE_CHARS
from src.ingestion.source_manifest import get_source_url  
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


@dataclass
class PageRecord:
    """One extracted page, with full provenance for later citation."""

    service_name: str
    file_name: str
    file_path: str          # absolute path, as a string (JSON/Chroma-friendly)
    page_number: int        # 1-indexed, matches what a human would cite
    total_pages: int
    text: str
    has_text: bool
    pdf_title: Optional[str] = None
    pdf_author: Optional[str] = None
    source_url: Optional[str] = None  
    extraction_error: Optional[str] = None


@dataclass
class FileIngestionResult:
    """Result of attempting to ingest a single PDF file."""

    service_name: str
    file_name: str
    file_path: str
    pages: list[PageRecord] = field(default_factory=list)
    fatal_error: Optional[str] = None  # set if the whole file couldn't be opened


def discover_pdfs(documents_dir: Path) -> list[Path]:
    """Recursively find every .pdf under documents_dir, sorted for a
    deterministic processing order.

    documents_dir/<service_name>/.../file.pdf is the expected layout, but
    any depth works -- the *first* path component under documents_dir is
    always treated as the service name (see `_service_name_for_path`), so
    adding documents/serviceE/new_file.pdf just works without code changes.
    """
    documents_dir = Path(documents_dir)
    if not documents_dir.exists():
        raise FileNotFoundError(f"Documents directory not found: {documents_dir}")

    pdf_paths = sorted(documents_dir.rglob("*.pdf"))
    if not pdf_paths:
        logger.warning("No PDF files found under %s", documents_dir)
    return pdf_paths


def _service_name_for_path(pdf_path: Path, documents_dir: Path) -> str:
    """The service name is the first path component under documents_dir."""
    relative = pdf_path.relative_to(documents_dir)
    return relative.parts[0]


def _extract_pdf_metadata(doc: "fitz.Document") -> dict:
    """Pull whatever metadata the PDF actually declares. Never invent
    missing fields -- absent values stay None, per the "don't invent
    metadata" requirement."""
    raw = doc.metadata or {}
    return {
        "title": raw.get("title") or None,
        "author": raw.get("author") or None,
    }


def load_pdf_pages(
    pdf_path: Path,
    documents_dir: Path,
    source_manifest: dict[str, dict[str, str]] | None = None,
) -> FileIngestionResult:
    """Extract every page of one PDF into PageRecords.

    Never raises for a single bad/corrupted PDF -- failures are captured
    in the returned result (`fatal_error`, or per-page `extraction_error`)
    so the caller can log them and keep processing the rest of the
    knowledge base instead of crashing the whole build.
    """
    pdf_path = Path(pdf_path)
    service_name = _service_name_for_path(pdf_path, documents_dir)
    source_url = get_source_url(source_manifest or {}, service_name, pdf_path.name)
    result = FileIngestionResult(
        service_name=service_name,
        file_name=pdf_path.name,
        file_path=str(pdf_path.resolve()),
    )

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any open failure is recoverable here
        logger.error("Could not open PDF %s: %s", pdf_path, exc)
        result.fatal_error = f"open_failed: {exc}"
        return result

    try:
        pdf_meta = _extract_pdf_metadata(doc)
        total_pages = doc.page_count

        if total_pages == 0:
            logger.warning("PDF has zero pages: %s", pdf_path)

        for page_index in range(total_pages):
            page_number = page_index + 1  # human-facing, 1-indexed

            try:
                page = doc.load_page(page_index)
                text = page.get_text("text") or ""
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Failed to extract text from %s page %d: %s",
                    pdf_path, page_number, exc,
                )
                result.pages.append(PageRecord(
                    service_name=service_name,
                    file_name=pdf_path.name,
                    file_path=str(pdf_path.resolve()),
                    page_number=page_number,
                    total_pages=total_pages,
                    text="",
                    has_text=False,
                    pdf_title=pdf_meta["title"],
                    pdf_author=pdf_meta["author"],
                    source_url=source_url, 
                    extraction_error=f"extract_failed: {exc}",
                ))
                continue

            has_text = len(text.strip()) >= MIN_PAGE_CHARS
            if not has_text:
                logger.warning(
                    "No extractable text on %s page %d "
                    "(possibly a scanned image or a blank page)",
                    pdf_path, page_number,
                )

            result.pages.append(PageRecord(
                service_name=service_name,
                file_name=pdf_path.name,
                file_path=str(pdf_path.resolve()),
                page_number=page_number,
                total_pages=total_pages,
                text=text,
                has_text=has_text,
                pdf_title=pdf_meta["title"],
                pdf_author=pdf_meta["author"],
                source_url=source_url,
            ))
    finally:
        doc.close()

    return result

def load_all_pdfs(
    documents_dir: Path,
    source_manifest: dict[str, dict[str, str]] | None = None,   
) -> list[FileIngestionResult]:
    """Discover and extract every PDF under documents_dir."""
    return [load_pdf_pages(p, documents_dir, source_manifest) for p in discover_pdfs(documents_dir)]
