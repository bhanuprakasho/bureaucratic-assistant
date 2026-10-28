"""Tests for src.processing.chunker."""

from src.ingestion.pdf_loader import PageRecord
from src.processing.chunker import chunk_document, split_text


def _make_pages(texts: list[str], service: str = "serviceA", file_name: str = "file1.pdf") -> list[PageRecord]:
    return [
        PageRecord(
            service_name=service,
            file_name=file_name,
            file_path=f"/tmp/{service}/{file_name}",
            page_number=i + 1,
            total_pages=len(texts),
            text=t,
            has_text=bool(t.strip()),
        )
        for i, t in enumerate(texts)
    ]


def test_split_text_respects_chunk_size_roughly():
    text = "word " * 500  # 2500 chars
    chunks = split_text(text, chunk_size=200, chunk_overlap=20)
    assert len(chunks) > 1
    assert all(len(c) <= 250 for c in chunks)  # some slack for merge boundaries


def test_split_text_empty_input():
    assert split_text("", chunk_size=100, chunk_overlap=10) == []


def test_split_text_short_input_is_a_single_chunk():
    assert split_text("short text", chunk_size=200, chunk_overlap=20) == ["short text"]


def test_chunk_document_preserves_metadata():
    pages = _make_pages(["Some eligibility text about age requirements. " * 5])
    chunks = chunk_document(pages, chunk_size=200, chunk_overlap=20)

    assert len(chunks) > 0
    for c in chunks:
        assert c.service_name == "serviceA"
        assert c.file_name == "file1.pdf"
        assert c.page_start == 1
        assert c.page_end == 1


def test_chunk_ids_are_deterministic():
    pages = _make_pages(["Repeatable content for determinism testing. " * 10])
    chunks_a = chunk_document(pages, chunk_size=150, chunk_overlap=20)
    chunks_b = chunk_document(pages, chunk_size=150, chunk_overlap=20)

    assert [c.chunk_id for c in chunks_a] == [c.chunk_id for c in chunks_b]


def test_chunk_ids_are_unique_within_a_document():
    pages = _make_pages(["Unique id test content. " * 30])
    chunks = chunk_document(pages, chunk_size=100, chunk_overlap=10)

    ids = [c.chunk_id for c in chunks]
    assert len(ids) == len(set(ids))


def test_chunk_id_format_includes_service_file_and_page():
    pages = _make_pages(["Passport rules content for minors. " * 5])
    chunks = chunk_document(pages, chunk_size=100, chunk_overlap=10)

    assert chunks[0].chunk_id.startswith("servicea_file1_p001_c")


def test_chunk_spans_multiple_pages_when_needed():
    pages = _make_pages([
        "Page one content about eligibility criteria for the scheme. " * 3,
        "Page two content continuing the same clause about documents. " * 3,
    ])
    chunks = chunk_document(pages, chunk_size=5000, chunk_overlap=100)

    # With a large chunk_size, both pages should merge into one chunk.
    assert len(chunks) == 1
    assert chunks[0].page_start == 1
    assert chunks[0].page_end == 2


def test_empty_pages_produce_no_chunks():
    pages = _make_pages(["", "   "])
    chunks = chunk_document(pages, chunk_size=200, chunk_overlap=20)
    assert chunks == []


def test_chunk_document_empty_list_returns_empty():
    assert chunk_document([], chunk_size=200, chunk_overlap=20) == []


def test_chunk_carries_pdf_metadata_through():
    pages = _make_pages(["Some content about required documents. " * 5])
    pages[0].pdf_title = "Passport Rules"
    pages[0].pdf_author = "Ministry of External Affairs"

    chunks = chunk_document(pages, chunk_size=200, chunk_overlap=20)

    assert chunks[0].pdf_title == "Passport Rules"
    assert chunks[0].pdf_author == "Ministry of External Affairs"
