"""
Step 4 - Embedding generation.

Wraps a pretrained Sentence-Transformers model so the rest of the
indexing pipeline doesn't need to know which model is in use or how
to batch-encode calls. This is a small pretrained *encoder*, not a
generative LLM -- no LLM is used or required for this step (see
"LLM Requirement" in the implementation guide).

Kept as a thin wrapper (not inlined into build_index.py) so the exact
same load/embed functions can be reused later by the retrieval stage
(Step 5), which must embed queries with this identical model.
"""

from __future__ import annotations

from sentence_transformers import SentenceTransformer

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Process-local cache so re-loading the model (e.g. build_index.py and
# inspect_index.py run back to back) doesn't re-read it from disk twice.
_model_cache: dict[str, SentenceTransformer] = {}


def load_embedding_model(model_name: str) -> SentenceTransformer:
    """Load (and cache) a pretrained sentence-embedding model.

    First call for a given model_name downloads and caches the model
    weights via Hugging Face's standard local cache directory; every
    call after that (including in later process runs) is local-only.
    """
    if model_name not in _model_cache:
        logger.info("Loading embedding model %r ...", model_name)
        _model_cache[model_name] = SentenceTransformer(model_name)
    return _model_cache[model_name]


def embed_texts(
    model: SentenceTransformer,
    texts: list[str],
    batch_size: int = 64,
) -> list[list[float]]:
    """Embed a list of chunk (or query) texts into dense vectors.

    Returns plain Python lists of floats, not numpy arrays, since
    that's what Chroma's client expects for its `embeddings=` argument.
    Never invents an embedding for empty input -- returns an empty list.
    """
    if not texts:
        return []

    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return embeddings.tolist()
