"""
Step 2 deliverable: load the source-URL manifest (data/sources.json)
that maps each ingested PDF back to its official government URL.

Kept separate from pdf_loader.py so URL lookup has one clear owner and
can be unit-tested (or swapped for a richer sources.json schema, e.g.
department/publication_date) without touching extraction logic.
"""

from __future__ import annotations

import json
from pathlib import Path

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def load_source_manifest(manifest_path: Path) -> dict[str, dict[str, str]]:
    """Load {service_name: {file_name: url}} from disk.

    Returns an empty dict (not an error) if the manifest doesn't exist
    yet -- URL attribution degrades to None per-file rather than
    blocking ingestion, consistent with how missing pdf_title/author
    are already handled.
    """
    manifest_path = Path(manifest_path)
    if not manifest_path.exists():
        logger.warning(
            "No source manifest found at %s -- chunks will have source_url=None. "
            "Create it to enable URL attribution.", manifest_path,
        )
        return {}

    try:
        with manifest_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Failed to load source manifest %s: %s", manifest_path, exc)
        return {}


def get_source_url(
    manifest: dict[str, dict[str, str]],
    service_name: str,
    file_name: str,
) -> str | None:
    """Look up the official URL for one file. Never invents a URL --
    returns None (and the caller logs) if the manifest has no entry."""
    url = manifest.get(service_name, {}).get(file_name)
    if url is None:
        logger.warning("No source_url in manifest for %s/%s", service_name, file_name)
    return url