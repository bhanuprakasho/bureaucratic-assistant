"""
Step 2 - Text cleaning.

Conservative clean-up of raw PDF-extracted text. The goal is to remove
*extraction artifacts* (broken line breaks, stray whitespace, odd
Unicode) -- never to remove, reword, or summarize actual government
content.

Known limitation: collapsing single line breaks into spaces (step 4
below) assumes a line break with no blank line after it is just layout
wrapping, not an intentional break. This is usually right for prose but
can merge separate bullet-point lines that a PDF didn't blank-separate.
That's an acceptable, documented trade-off for a generic cleaner that
must not assume any particular document's layout.
"""

from __future__ import annotations

import re
import unicodedata

# A hyphen at the end of a line, followed by a lowercase letter, is
# almost always a word broken across a line by the PDF layout
# (e.g. "govern-\nment" -> "government").
_HYPHEN_LINEBREAK_RE = re.compile(r"(\w)-\n(\w)")

# A line break that isn't followed by another newline is usually just
# PDF layout wrapping, not an intentional paragraph break.
_SOFT_LINEBREAK_RE = re.compile(r"(?<!\n)\n(?!\n)")

# 3+ blank lines collapse to a single paragraph break.
_EXCESS_BLANK_LINES_RE = re.compile(r"\n{3,}")

# 2+ spaces/tabs collapse to one space.
_EXCESS_WHITESPACE_RE = re.compile(r"[ \t]{2,}")

# Non-printable / control / zero-width characters PyMuPDF sometimes
# emits that carry no meaning.
_CONTROL_CHARS_RE = re.compile(r"[\x0b\x0c\u200b\u200c\u200d\ufeff]")


def clean_text(text: str) -> str:
    """Apply conservative, generic cleaning to one page/chunk of text.

    Order matters: Unicode normalization first, then structural fixes
    (hyphenation, line breaks), then whitespace collapsing last.
    """
    if not text:
        return ""

    # 1. Unicode normalization (e.g. combined vs. precomposed accents).
    text = unicodedata.normalize("NFKC", text)

    # 2. Strip stray control / zero-width characters.
    text = _CONTROL_CHARS_RE.sub("", text)

    # 3. Rejoin words hyphenated across a line break by the PDF layout.
    text = _HYPHEN_LINEBREAK_RE.sub(r"\1\2", text)

    # 4. Collapse single line breaks (layout wrapping) into spaces, but
    #    keep double line breaks as paragraph separators.
    text = _SOFT_LINEBREAK_RE.sub(" ", text)

    # 5. Collapse runs of blank lines / spaces.
    text = _EXCESS_BLANK_LINES_RE.sub("\n\n", text)
    text = _EXCESS_WHITESPACE_RE.sub(" ", text)

    # 6. Trim trailing whitespace per line, and leading/trailing
    #    whitespace on the whole text.
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines).strip()

    return text


def clean_pages(texts: list[str]) -> list[str]:
    """Convenience wrapper to clean a list of page texts in one call."""
    return [clean_text(t) for t in texts]
