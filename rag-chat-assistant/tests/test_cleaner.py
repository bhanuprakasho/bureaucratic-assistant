"""Tests for src.processing.cleaner."""

from src.processing.cleaner import clean_text


def test_collapses_excess_whitespace():
    assert clean_text("hello    world") == "hello world"


def test_collapses_excess_blank_lines():
    result = clean_text("para one\n\n\n\n\npara two")
    assert result == "para one\n\npara two"


def test_rejoins_hyphenated_linebreak():
    assert clean_text("govern-\nment") == "government"


def test_preserves_paragraph_breaks():
    result = clean_text("First paragraph.\n\nSecond paragraph.")
    assert "First paragraph." in result
    assert "Second paragraph." in result
    assert "\n\n" in result


def test_collapses_single_linebreak_layout_wrap():
    result = clean_text("This sentence wraps\nacross two lines.")
    assert result == "This sentence wraps across two lines."


def test_does_not_alter_meaningful_content():
    original = "Applicants under 18 years must submit Annexure C."
    assert clean_text(original) == original


def test_strips_control_and_zero_width_characters():
    result = clean_text("hello\u200bworld\x0c")
    assert "\u200b" not in result
    assert "\x0c" not in result


def test_empty_input_returns_empty_string():
    assert clean_text("") == ""


def test_none_like_falls_back_gracefully():
    assert clean_text("   \n\n  ") == ""
