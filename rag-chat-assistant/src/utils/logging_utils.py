"""Small shared logging setup so every module logs consistently."""

from __future__ import annotations

import logging


def get_logger(name: str) -> logging.Logger:
    """Return a module-level logger. Formatting/handlers are configured
    once by whichever script is the entry point (see scripts/*.py) --
    library modules should just log, not configure logging."""
    return logging.getLogger(name)


def configure_root_logging(level: int = logging.INFO) -> None:
    """Configure the root logger. Call this once, from a script's
    entry point."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
