"""
Step 9 - Source attribution.

Turns the chunks that back an answer into a short, de-duplicated list of
sources: government document, pages, and official URL.

Which chunks are cited is decided in generator.py (not here):
  GROUNDED         -> only chunks that the grounding check matched to at
                      least one supported sentence of the answer
  FALLBACK         -> the chunks whose text is shown to the user
  NOT_ENOUGH_INFO  -> nothing (no answer was given, so nothing to cite)

This module only formats what it is given. It never invents anything:
a missing source_url stays None and is shown as "not available", and a
missing page number is simply left out.

No section is cited because ingestion does not produce section metadata
(see README, Known limitations).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable, Optional, Sequence

from src.retrieval.retriever import RetrievedChunk

URL_UNAVAILABLE = "official URL not available"


@dataclass(frozen=True)
class SourceReference:
    """One government document that supports (part of) an answer."""

    service_name: Optional[str]
    file_name: Optional[str]
    pages: tuple[int, ...]              # sorted, unique, 1-indexed
    source_url: Optional[str]
    chunk_ids: tuple[str, ...]          # chunks of this document that were cited

    @property
    def document_name(self) -> str:
        return self.file_name or "unknown document"

    @property
    def page_label(self) -> str:
        return format_pages(self.pages)

    def to_dict(self) -> dict[str, Any]:
        """Plain dict for a future frontend / JSON response."""
        data = asdict(self)
        data["document_name"] = self.document_name
        data["page_label"] = self.page_label
        return data


# --- helpers ---------------------------------------------------------------------

def format_pages(pages: Sequence[int]) -> str:
    """(19, 20, 21, 32) -> 'pages 19-21, 32'; (5,) -> 'page 5'; () -> ''."""
    nums = sorted(set(pages))
    if not nums:
        return ""

    ranges: list[tuple[int, int]] = []
    start = prev = nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
            continue
        ranges.append((start, prev))
        start = prev = n
    ranges.append((start, prev))

    parts = [str(a) if a == b else f"{a}-{b}" for a, b in ranges]
    return ("page " if len(nums) == 1 else "pages ") + ", ".join(parts)


def _pages_of(chunk: RetrievedChunk) -> set[int]:
    """Every page the chunk covers. Unknown pages (None) contribute nothing."""
    start, end = chunk.page_start, chunk.page_end
    if start is None:
        return set()
    if end is None or end < start:
        end = start
    return set(range(int(start), int(end) + 1))


# --- main API ---------------------------------------------------------------------

def build_sources(chunks: Iterable[RetrievedChunk]) -> list[SourceReference]:
    """Group cited chunks by document, merge their pages, keep rank order.

    Documents appear in the order their first chunk appears in `chunks`
    (best match first, if the caller passes them in retrieval order).
    """
    order: list[tuple[Optional[str], Optional[str]]] = []
    groups: dict[tuple[Optional[str], Optional[str]], dict[str, Any]] = {}

    for chunk in chunks:
        key = (chunk.service_name, chunk.file_name)
        if key not in groups:
            order.append(key)
            groups[key] = {"pages": set(), "url": None, "ids": []}
        group = groups[key]
        group["pages"] |= _pages_of(chunk)
        if group["url"] is None and chunk.source_url:
            group["url"] = chunk.source_url
        if chunk.chunk_id not in group["ids"]:
            group["ids"].append(chunk.chunk_id)

    return [
        SourceReference(
            service_name=key[0],
            file_name=key[1],
            pages=tuple(sorted(groups[key]["pages"])),
            source_url=groups[key]["url"],
            chunk_ids=tuple(groups[key]["ids"]),
        )
        for key in order
    ]


def sources_for_answer(answer, chunks: Sequence[RetrievedChunk]) -> list[SourceReference]:
    """Sources for a GeneratedAnswer, looked up from the retrieved chunks.

    `answer.cited_chunk_ids` says which chunks to cite; `chunks` is the list
    returned by check_scope. Returns [] when nothing is cited (for example a
    NOT_ENOUGH_INFO answer). Unknown ids are ignored rather than guessed.
    """
    by_id = {c.chunk_id: c for c in chunks}
    cited = [by_id[cid] for cid in answer.cited_chunk_ids if cid in by_id]
    return build_sources(cited)


def format_sources(sources: Sequence[SourceReference]) -> str:
    """Plain-text source list for the terminal. Empty string if no sources."""
    if not sources:
        return ""

    lines = ["Sources:"]
    for i, src in enumerate(sources, start=1):
        pages = f" ({src.page_label})" if src.page_label else ""
        lines.append(f"  {i}. {src.document_name}{pages}")
        lines.append(f"     {src.source_url or URL_UNAVAILABLE}")
    return "\n".join(lines)
