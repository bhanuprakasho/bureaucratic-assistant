#!/usr/bin/env python3
"""
Try the pipeline so far end to end (Steps 5 + 6 + 8):

    retrieve -> scope/sufficiency check -> generate -> grounding check -> print

Requires Ollama running with the model pulled:
    ollama pull llama3.2:3b

Usage:
    python scripts/ask.py --query "how can a minor get a passport" --service passport
    python scripts/ask.py                       # interactive: pick a service, then ask
    python scripts/ask.py --show-grounding      # per-sentence grounding scores
    python scripts/ask.py --show-raw            # the LLM's raw text, even if it was rejected
    python scripts/ask.py --show-context        # chunks used as context

This is a developer try-out tool, not the final user interface. Each
GROUNDED / FALLBACK answer is followed by its sources (Step 9: document,
pages, official URL). User-facing wording for refusals (Step 10) does not
exist yet.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from src.generation.generator import AnswerStatus, GeneratedAnswer, generate_answer, select_context_chunks
from src.generation.grounding import default_embed_fn
from src.attribution.sources import format_sources, sources_for_answer
from src.generation.llm_client import DEFAULT_MODEL, OllamaClient
from src.retrieval.retriever import DEFAULT_TOP_K, Retriever
from src.scope.sufficiency import Verdict, check_scope
from src.utils.logging_utils import configure_root_logging


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ask a question: retrieve, check scope, generate, verify.")
    parser.add_argument("--query", type=str, default=None, help="Single question. Omit for interactive mode.")
    parser.add_argument("--service", type=str, default=None, help="Restrict to one service (e.g. passport).")
    parser.add_argument("-k", "--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ollama model name.")
    parser.add_argument("--show-context", action="store_true")
    parser.add_argument("--show-grounding", action="store_true")
    parser.add_argument("--show-raw", action="store_true")
    return parser.parse_args()


def choose_service(retriever: Retriever) -> Optional[str]:
    services = retriever.available_services()
    print("\nAvailable services:")
    for i, name in enumerate(services, start=1):
        print(f"  {i}. {name}")
    print("  0. all services")
    lowered = {s.lower(): s for s in services}
    while True:
        choice = input("Choose a service (number or name, Enter for all): ").strip().lower()
        if choice in ("", "0", "all"):
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(services):
            return services[int(choice) - 1]
        if choice in lowered:
            return lowered[choice]
        print("Not a valid choice, try again.")


def ask(retriever, llm, embed_fn, query: str, service: Optional[str], args) -> None:
    result, chunks = check_scope(retriever, query, service=service, k=args.top_k)

    print(f"\nScope check: {result.verdict.value}")
    print(f"  {result.reason}")
    if result.suggested_service:
        print(f"  This looks more like a '{result.suggested_service}' question "
              f"(similarity {result.suggested_service_similarity:.2f}) - consider switching service.")

    if result.verdict is not Verdict.SUFFICIENT:
        print("\nNo answer generated: the documents do not support one.")
        return

    print(f"\nGenerating with {llm.model} (this can take a while on CPU)...")
    answer: GeneratedAnswer = generate_answer(
        query, chunks, llm, service=service, embed_fn=embed_fn,
    )

    print("\n" + "=" * 70)
    print(answer.text)
    print("=" * 70)
    print(f"Status: {answer.status.value}")
    if answer.fallback_reason:
        print(f"Fallback reason: {answer.fallback_reason}")

    # Step 9: sources. Only for answers that actually show source-backed text.
    sources = sources_for_answer(answer, chunks)
    if sources:
        print("\n" + format_sources(sources))

    if args.show_raw and answer.raw_llm_text:
        print(f"\nRaw LLM text:\n{answer.raw_llm_text}")

    if args.show_grounding and answer.grounding:
        g = answer.grounding
        print(f"\nGrounding: {'PASS' if g.passed else 'FAIL'} - {g.reason}")
        for c in g.sentence_checks:
            mark = "ok  " if c.supported else "weak"
            src = ""
            if c.source_index is not None and c.source_index < len(answer.context_chunk_ids):
                src = f"  <- {answer.context_chunk_ids[c.source_index]}"
            print(f"  [{mark}] {c.best_similarity:.2f}  {c.sentence}{src}")

    if args.show_context:
        used = {c.chunk_id for c in select_context_chunks(chunks)}
        cited = set(answer.cited_chunk_ids)
        print("\nChunks used as context (* = cited as a source):")
        for c in chunks:
            if c.chunk_id in used:
                star = "*" if c.chunk_id in cited else " "
                print(f"  {star} {c.file_name} p.{c.page_start}-{c.page_end}  sim={c.similarity:.3f}  [{c.chunk_id}]")
                print(f"      {' '.join(c.text.split())[:400]}")


def main() -> int:
    configure_root_logging(logging.WARNING)
    args = parse_args()

    try:
        retriever = Retriever.from_config()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"\n{exc}")
        return 1

    llm = OllamaClient(model=args.model)
    embed_fn = default_embed_fn()

    try:
        if args.query:
            ask(retriever, llm, embed_fn, args.query, args.service, args)
            return 0

        service = args.service or choose_service(retriever)
        print(f"\nAsking about: {service or 'all services'}. Type ':service' to switch, 'exit' to quit.")
        while True:
            try:
                query = input("\nQuestion> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
            if query.lower() in ("exit", "quit"):
                return 0
            if query == ":service":
                service = choose_service(retriever)
                continue
            try:
                ask(retriever, llm, embed_fn, query, service, args)
            except ValueError as exc:
                print(f"  {exc}")
    except ValueError as exc:
        print(f"\n{exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
