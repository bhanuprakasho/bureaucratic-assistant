"""Tests for src.processing.writer."""

from pathlib import Path

import pytest

from src.processing.chunker import Chunk
from src.processing.writer import read_chunks_jsonl, write_chunks_jsonl


def _sample_chunk(chunk_id: str = "servicea_file1_p001_c001") -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        text="Applicants under 18 must submit Annexure C.",
        service_name="serviceA",
        file_name="file1.pdf",
        file_path="/documents/serviceA/file1.pdf",
        page_start=1,
        page_end=1,
        chunk_index=0,
        char_count=44,
        pdf_title="Passport Rules",
        pdf_author=None,
    )


def test_write_then_read_round_trip(tmp_path: Path):
    output_path = tmp_path / "processed" / "chunks.jsonl"
    chunks = [_sample_chunk("a_1"), _sample_chunk("a_2")]

    written = write_chunks_jsonl(chunks, output_path)
    records = list(read_chunks_jsonl(output_path))

    assert written == 2
    assert len(records) == 2
    assert records[0]["chunk_id"] == "a_1"
    assert records[0]["text"] == chunks[0].text
    assert records[0]["service_name"] == "serviceA"
    assert records[0]["pdf_title"] == "Passport Rules"
    assert records[0]["pdf_author"] is None


def test_write_creates_parent_directories(tmp_path: Path):
    output_path = tmp_path / "a" / "b" / "c" / "chunks.jsonl"
    write_chunks_jsonl([_sample_chunk()], output_path)
    assert output_path.exists()


def test_write_overwrites_existing_file(tmp_path: Path):
    output_path = tmp_path / "chunks.jsonl"
    write_chunks_jsonl([_sample_chunk("a_1"), _sample_chunk("a_2")], output_path)
    write_chunks_jsonl([_sample_chunk("b_1")], output_path)

    records = list(read_chunks_jsonl(output_path))
    assert len(records) == 1
    assert records[0]["chunk_id"] == "b_1"


def test_read_missing_file_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        list(read_chunks_jsonl(tmp_path / "does_not_exist.jsonl"))


def test_read_skips_malformed_lines(tmp_path: Path):
    output_path = tmp_path / "chunks.jsonl"
    write_chunks_jsonl([_sample_chunk("a_1")], output_path)
    with output_path.open("a", encoding="utf-8") as f:
        f.write("{not valid json\n")
        f.write("\n")  # blank line should also be skipped silently

    records = list(read_chunks_jsonl(output_path))
    assert len(records) == 1
    assert records[0]["chunk_id"] == "a_1"


def test_empty_chunk_list_writes_empty_file(tmp_path: Path):
    output_path = tmp_path / "chunks.jsonl"
    written = write_chunks_jsonl([], output_path)
    assert written == 0
    assert list(read_chunks_jsonl(output_path)) == []
