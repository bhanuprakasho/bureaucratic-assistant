"""Tests for src.ingestion.pdf_loader."""

from pathlib import Path

import pymupdf as fitz
import pytest

from src.ingestion.pdf_loader import discover_pdfs, load_pdf_pages


def _make_pdf(path: Path, pages_text: list[str]) -> None:
    """Create a minimal real PDF with one page per string in pages_text."""
    doc = fitz.open()
    for text in pages_text:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text)
    doc.save(str(path))
    doc.close()


def test_discover_pdfs_finds_files_per_service(tmp_path: Path):
    (tmp_path / "serviceA").mkdir()
    (tmp_path / "serviceB").mkdir()
    _make_pdf(tmp_path / "serviceA" / "file1.pdf", ["hello"])
    _make_pdf(tmp_path / "serviceB" / "file1.pdf", ["world"])

    found = discover_pdfs(tmp_path)

    assert len(found) == 2
    assert all(p.suffix == ".pdf" for p in found)


def test_discover_pdfs_is_recursive(tmp_path: Path):
    nested = tmp_path / "serviceA" / "subfolder"
    nested.mkdir(parents=True)
    _make_pdf(nested / "deep.pdf", ["nested content"])

    found = discover_pdfs(tmp_path)

    assert len(found) == 1
    assert found[0].name == "deep.pdf"


def test_discover_pdfs_missing_dir_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        discover_pdfs(tmp_path / "does_not_exist")


def test_discover_pdfs_empty_dir_returns_empty_list(tmp_path: Path):
    assert discover_pdfs(tmp_path) == []


def test_load_pdf_pages_extracts_text_and_service_name(tmp_path: Path):
    (tmp_path / "serviceA").mkdir()
    pdf_path = tmp_path / "serviceA" / "file1.pdf"
    _make_pdf(pdf_path, ["Hello world", "Second page"])

    result = load_pdf_pages(pdf_path, tmp_path)

    assert result.fatal_error is None
    assert result.service_name == "serviceA"
    assert result.file_name == "file1.pdf"
    assert len(result.pages) == 2
    assert result.pages[0].page_number == 1
    assert result.pages[1].page_number == 2
    assert "Hello" in result.pages[0].text
    assert result.pages[0].has_text is True


def test_load_pdf_pages_flags_empty_page(tmp_path: Path):
    (tmp_path / "serviceA").mkdir()
    pdf_path = tmp_path / "serviceA" / "blank.pdf"
    _make_pdf(pdf_path, [""])

    result = load_pdf_pages(pdf_path, tmp_path)

    assert len(result.pages) == 1
    assert result.pages[0].has_text is False


def test_load_pdf_pages_handles_corrupted_file(tmp_path: Path):
    (tmp_path / "serviceA").mkdir()
    bad_pdf = tmp_path / "serviceA" / "corrupted.pdf"
    bad_pdf.write_bytes(b"not a real pdf")

    result = load_pdf_pages(bad_pdf, tmp_path)

    assert result.fatal_error is not None
    assert result.pages == []


def test_load_pdf_pages_does_not_invent_metadata(tmp_path: Path):
    (tmp_path / "serviceA").mkdir()
    pdf_path = tmp_path / "serviceA" / "no_meta.pdf"
    _make_pdf(pdf_path, ["content"])

    result = load_pdf_pages(pdf_path, tmp_path)

    # PyMuPDF returns "" (falsy) for unset metadata fields; our loader
    # must normalize that to None rather than inventing a placeholder.
    assert result.pages[0].pdf_title is None
    assert result.pages[0].pdf_author is None
