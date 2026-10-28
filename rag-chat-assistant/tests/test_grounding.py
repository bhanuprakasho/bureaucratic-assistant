"""Tests for src/generation/grounding.py.

A deterministic bag-of-words embedding stands in for the real model, so
similarity here simply reflects shared words. No model download needed.
"""

from __future__ import annotations

import re
import zlib

from src.generation.grounding import (
    check_grounding,
    context_pieces,
    extract_numbers,
    split_sentences,
    strip_list_markers,
)

DIM = 256


def fake_embed(texts):
    vectors = []
    for text in texts:
        v = [0.0] * DIM
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            v[zlib.crc32(word.encode()) % DIM] += 1.0
        vectors.append(v)
    return vectors


CONTEXT = [
    "The following documents are required for a minor: birth certificate, "
    "ID proof of the parent and Annexure C. Minor passports are valid for 5 years."
]


# --- helpers ------------------------------------------------------------------

def test_extract_numbers_removes_thousands_separators_and_keeps_decimals():
    assert extract_numbers("Fee is Rs. 1,500 and 3.5 percent in 2022.") == {"1500", "3.5", "2022"}


def test_list_markers_are_not_treated_as_numbers():
    answer = "1. Birth certificate\n2) Parent ID proof\n- Annexure C"
    assert extract_numbers(strip_list_markers(answer)) == set()


def test_split_sentences_splits_on_punctuation_and_newlines():
    assert split_sentences("One thing. Another thing!\nThird") == ["One thing.", "Another thing!", "Third"]


def test_long_context_sentences_are_windowed():
    long_sentence = " ".join(f"word{i}" for i in range(120)) + "."
    pieces = context_pieces([long_sentence])
    assert len(pieces) > 1
    assert all(len(p.split()) <= 40 for p in pieces)


# --- number check -----------------------------------------------------------------

def test_invented_number_fails_grounding():
    answer = "Minor passports are valid for 10 years."
    result = check_grounding(answer, CONTEXT, embed_fn=fake_embed)
    assert not result.passed
    assert result.unsupported_numbers == ["10"]


def test_number_from_the_question_is_allowed():
    answer = "Since you are 17, you need the minor procedure documents listed here."
    context = ["Applicants below 18 follow the minor procedure documents listed here."]
    result = check_grounding(answer, context, query="I am 17, what documents do I need?", embed_fn=fake_embed)
    assert result.unsupported_numbers == []


# --- meaning check ------------------------------------------------------------------

def test_faithful_answer_passes():
    answer = "A minor needs a birth certificate, ID proof of the parent and Annexure C."
    result = check_grounding(answer, CONTEXT, embed_fn=fake_embed)
    assert result.passed, result.reason
    assert result.supported_fraction == 1.0


def test_unrelated_sentence_fails_grounding():
    answer = "Visit the nearest embassy in London to collect your visa stamp."
    result = check_grounding(answer, CONTEXT, embed_fn=fake_embed)
    assert not result.passed
    assert result.supported_fraction == 0.0


def test_mostly_supported_answer_passes_but_mostly_unsupported_fails():
    supported = "A minor needs a birth certificate, ID proof of the parent and Annexure C."
    invented = "Bring two witnesses and a notarised affidavit from the district court."
    # 1 of 2 sentences supported -> below the default 80%
    result = check_grounding(f"{supported} {invented}", CONTEXT, embed_fn=fake_embed)
    assert not result.passed
    assert result.supported_fraction == 0.5
    # but passes if the required fraction is lowered
    assert check_grounding(f"{supported} {invented}", CONTEXT, embed_fn=fake_embed,
                           min_supported_fraction=0.5).passed


def test_very_short_sentences_are_skipped():
    answer = "A minor needs a birth certificate, ID proof of the parent and Annexure C. Good luck!"
    result = check_grounding(answer, CONTEXT, embed_fn=fake_embed)
    assert len(result.sentence_checks) == 1
    assert result.passed


def test_empty_answer_fails():
    assert not check_grounding("   ", CONTEXT, embed_fn=fake_embed).passed


def test_empty_context_fails_any_substantive_answer():
    result = check_grounding("A minor needs a birth certificate and a parent ID.", [], embed_fn=fake_embed)
    assert not result.passed


# --- Step 9: which source text backs each sentence --------------------------------------

def test_sentence_checks_record_which_context_text_matched_best():
    contexts = [
        "The fee schedule is published on the portal and revised yearly.",
        "A minor needs a birth certificate, ID proof of the parent and Annexure C.",
    ]
    answer = "A minor needs a birth certificate, ID proof of the parent and Annexure C."
    result = check_grounding(answer, contexts, embed_fn=fake_embed)
    assert result.sentence_checks[0].source_index == 1


def test_context_pieces_with_source_tracks_owner_of_each_piece():
    from src.generation.grounding import context_pieces_with_source
    tagged = context_pieces_with_source(["First one here. Second one here.", "Other text entirely now."])
    assert [i for i, _ in tagged] == [0, 0, 1]
