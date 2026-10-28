"""
Step 8 - Prompt templates.

The prompt is the main mechanism that keeps the LLM from inventing
government rules. Three deliberate choices:

1. A FIXED refusal sentence. When the context does not contain the
   answer, the model must reply with exactly NOT_ENOUGH_INFO_SENTENCE, so
   code can detect a refusal reliably instead of parsing free text.
2. The no-invention rule is stated twice: in the system prompt and again
   at the very end of the user message (instructions placed last are
   followed more reliably by small models).
3. Retrieved text is passed WITHOUT file names or page numbers. Source
   attribution is handled by code (Step 9) from chunk metadata; asking the
   model to cite sources invites invented citations.

`reasoning_result` is an optional slot for Step 7 (rule-based reasoning).
It is None today; when Step 7 exists its verified output goes there as
"VERIFIED FACTS" and the model is told to restate, not recompute, it.
"""

from __future__ import annotations

from typing import Mapping, Optional, Sequence, Union

from src.retrieval.retriever import RetrievedChunk

NOT_ENOUGH_INFO_SENTENCE = (
    "The provided documents do not contain enough information to answer this."
)

SYSTEM_PROMPT = (
    "You explain Indian government services in plain, simple English.\n"
    "\n"
    "Rules you must follow:\n"
    "1. Answer ONLY from the CONTEXT in the user's message. Use no other knowledge.\n"
    "2. If the CONTEXT does not contain the answer, reply with exactly this "
    f'sentence and nothing else: "{NOT_ENOUGH_INFO_SENTENCE}"\n'
    "3. Never invent or guess rules, fees, dates, numbers, deadlines, form names, "
    "document names or office names. Every number and name in your answer must "
    "appear in the CONTEXT.\n"
    "4. Do not decide whether the user is eligible unless the CONTEXT states the "
    "rule explicitly. Say what the documents state.\n"
    "5. Be concise: a short answer, or a short bullet list for documents or steps. "
    "No introduction, no legal advice.\n"
    '6. Do not use the word "context" in your answer.\n'
    "7. Never say in your own words that something is missing, not mentioned or "
    "not provided. If you cannot answer, use the exact sentence from rule 2. If "
    "the CONTEXT does contain the answer, give it.\n"
)

ReasoningResult = Union[str, Mapping[str, object]]


def _format_reasoning(reasoning_result: ReasoningResult) -> str:
    if isinstance(reasoning_result, str):
        return reasoning_result.strip()
    return "\n".join(f"- {key}: {value}" for key, value in reasoning_result.items())


def build_user_prompt(
    query: str,
    chunks: Sequence[RetrievedChunk],
    service: Optional[str] = None,
    reasoning_result: Optional[ReasoningResult] = None,
) -> str:
    """Assemble the user message: context, optional verified facts, question."""
    parts: list[str] = []
    if service:
        parts.append(f"SERVICE: {service}\n")

    parts.append("CONTEXT:")
    parts.append("\n---\n".join(c.text.strip() for c in chunks))

    if reasoning_result:
        parts.append(
            "\nVERIFIED FACTS (already checked by the system; restate them, "
            "do not recompute them):\n" + _format_reasoning(reasoning_result)
        )

    parts.append(f"\nQUESTION:\n{query.strip()}")
    parts.append(
        "\nRemember: use only the CONTEXT above. If it does not contain the "
        f'answer, reply with exactly: "{NOT_ENOUGH_INFO_SENTENCE}"'
    )
    return "\n".join(parts)
