#!/usr/bin/env python3
"""
Simple Streamlit frontend for the RAG Bureaucratic Assistant.

Flow per question (same as scripts/ask.py):
    check_scope -> (SUFFICIENT only) generate_answer -> show answer + sources

Run from the project root:
    pip install streamlit
    streamlit run scripts/app.py

Requires: the vector store built (build_chunks.py, build_index.py) and
Ollama running with the model pulled (ollama pull llama3.2:3b).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.attribution.sources import sources_for_answer
from src.generation.generator import AnswerStatus, generate_answer
from src.generation.grounding import default_embed_fn
from src.generation.llm_client import OllamaClient
from src.retrieval.retriever import Retriever
from src.scope.sufficiency import Verdict, check_scope

ALL_SERVICES = "All services"

# Clickable sample questions per service (edit freely).
EXAMPLES = {
    "passport": [
        "What should I do if my passport is lost or stolen?",
        "What documents can I use for proof of address?",
        "My 12 year old daughter needs a passport, what is the process?",
        "What passport validity will my son get if he studies in a hostel away from us?",
    ],
    "aadhaar": [
        "What is the Aadhaar helpline number?",
        "Which documents can I use as proof of address for Aadhaar?",
        "Can a newborn baby get an Aadhaar?",
    ],
    "kcc": [
        "Who can get a Kisan Credit Card?",
        "Can I use mobile banking to transfer funds?",
        "What is the credit limit for marginal farmers and what does it depend on?",
    ],
    "voter-id": [
        "How do I register as a new voter?",
        "Which documents do I attach with my voter registration application?",
        "Where do I submit Form 6 after filling it in?",
    ],
    "pan": [
        "What documents do I require for obtaining a new e-PAN?",
        "How do I get a physical PAN card?",
    ],
    "she": [
        "I am a B Tech student. Can I apply for this SHE scholarship?",
        "How will I receive my scholarship?",
    ],
}

SERVICE_LABELS = {            
    "passport": "Passport",
    "aadhaar": "Aadhaar",
    "kcc": "Kisan Credit Card (KCC)",
    "voter-id": "Voter ID",
    "pan" : "PAN Card",
    "she" : "Scholarship for Higher Education",
}

def service_label(name: str) -> str:  
    return SERVICE_LABELS.get(name, name.replace("-", " ").title())

MSG_OUT_OF_SCOPE = (
    "This question doesn't seem to be related to this service, so I can't "
    "answer it from the official documents I have."
)
MSG_INSUFFICIENT = (
    "I found related documents, but they don't contain enough information "
    "to answer this reliably."
)
MSG_NOT_ENOUGH = "The documents I have do not contain enough information to answer this."


@st.cache_resource(show_spinner="Loading the knowledge base...")
def load_components():
    return Retriever.from_config(), OllamaClient(), default_embed_fn()


def get_answer(retriever, llm, embed_fn, query: str, service: str | None) -> dict:
    """Run the pipeline and return a plain dict the UI can store and render."""
    result, chunks = check_scope(retriever, query, service=service)

    entry = {
        "role": "assistant",
        "text": "",
        "note": None,
        "sources": [],
        "details": {
            "verdict": result.verdict.value,
            "reason": result.reason,
            "top_similarity": result.top_similarity,
            "chunks": [(c.file_name, c.page_start, c.similarity, c.text) for c in chunks],
        },
    }

    if result.suggested_service:
        entry["note"] = (
            f"This looks like a '{service_label(result.suggested_service)}' question. "
            "Pick that service in the sidebar for a better answer."
        )

    if result.verdict is Verdict.OUT_OF_SCOPE:
        entry["text"] = MSG_OUT_OF_SCOPE
        return entry
    if result.verdict is Verdict.INSUFFICIENT:
        entry["text"] = MSG_INSUFFICIENT
        return entry

    answer = generate_answer(query, chunks, llm, service=service, embed_fn=embed_fn)
    if answer.status is AnswerStatus.NOT_ENOUGH_INFO:
        entry["text"] = MSG_NOT_ENOUGH
        return entry

    entry["text"] = answer.text
    # Step 9: same source logic as scripts/ask.py (answer.cited_chunk_ids)
    for src in sources_for_answer(answer, chunks):
        entry["sources"].append((src.document_name, src.page_label, src.source_url))
    entry["details"]["status"] = answer.status.value
    entry["details"]["fallback_reason"] = answer.fallback_reason
    return entry

def to_markdown(text: str) -> str:
    """Turn '•' bullets into real markdown list items, one per line."""
    text = re.sub(r"\s*[•●▪]\s+", "\n- ", text)
    text = re.sub(r"([^\n])\n- ", r"\1\n\n- ", text, count=1)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def render_entry(entry: dict, show_details: bool) -> None:
    with st.chat_message(entry["role"]):
        st.markdown(to_markdown(entry["text"]))
        if entry.get("note"):
            st.info(entry["note"])
        if entry.get("sources"):
            with st.expander("Sources"):
                for file_name, page_label, url in entry["sources"]:
                    line = f"**{file_name}**" + (f", {page_label}" if page_label else "")
                    if url:
                        line += f" - [official document]({url})"
                    st.markdown(line)
        if show_details and entry.get("details"):
            d = entry["details"]
            with st.expander("Details (developer view)"):
                top = f"{d['top_similarity']:.2f}" if d.get("top_similarity") is not None else "n/a"
                st.write(f"Scope verdict: **{d['verdict']}** (best similarity {top})")
                st.caption(d["reason"])
                if d.get("status"):
                    st.write(f"Answer status: **{d['status']}**")
                if d.get("fallback_reason"):
                    st.caption(d["fallback_reason"])
                for file_name, page, sim, text in d["chunks"]:
                    st.markdown(f"`{file_name}` p.{page} - similarity {sim:.2f}")
                    st.text(" ".join(text.split())[:300])


def main() -> None:
    st.set_page_config(page_title="Government Services Assistant", page_icon="🏛️")
    st.title("Government Services Assistant")
    st.caption("Answers come only from official government documents. "
               "This is general guidance, not legal advice.")

    try:
        retriever, llm, embed_fn = load_components()
    except (FileNotFoundError, RuntimeError) as exc:
        st.error(f"{exc}")
        st.stop()

    # --- sidebar -----------------------------------------------------------
    services = retriever.available_services()
    choice = st.sidebar.selectbox(                    
        "Service",
        [ALL_SERVICES] + services,
        format_func=lambda name: name if name == ALL_SERVICES else service_label(name),
    )
    service = None if choice == ALL_SERVICES else choice
    show_details = st.sidebar.checkbox("Show details", value=False)

    if "histories" not in st.session_state:
        st.session_state.histories = {}
    history = st.session_state.histories.setdefault(choice, [])   # one chat per service

    if st.sidebar.button("Clear chat"):
        history.clear()

    clicked = None
    st.sidebar.markdown("**Example questions**")
    examples = EXAMPLES.get(service, []) if service else [qs[0] for qs in EXAMPLES.values()]
    for i, example in enumerate(examples):
        if st.sidebar.button(example, key=f"ex_{choice}_{i}"):
            clicked = example

    # --- chat ----------------------------------------------------------------
    for entry in history:
        render_entry(entry, show_details)

    query = st.chat_input("Ask a question about this service") or clicked
    if query:
        user_entry = {"role": "user", "text": query}
        history.append(user_entry)
        render_entry(user_entry, show_details)

        try:
            with st.spinner("Searching the documents and writing an answer (this can take a minute)..."):
                reply = get_answer(retriever, llm, embed_fn, query, service)
        except ValueError as exc:
            reply = {"role": "assistant", "text": str(exc), "sources": [], "details": None}

        history.append(reply)
        render_entry(reply, show_details)


if __name__ == "__main__":
    main()
