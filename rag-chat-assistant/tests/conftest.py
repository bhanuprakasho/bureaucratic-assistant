"""Shared pytest configuration: make the project root importable as
`config` and `src.*` from every test file, without each test needing
its own sys.path hack."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
