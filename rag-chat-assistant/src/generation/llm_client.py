"""
Step 8 - LLM access (local Ollama).

A deliberately small client: one `generate(system, user) -> str` call
against a locally running Ollama server (https://ollama.com). It uses
only the standard library, so no new pip dependency is needed.

Setup on Windows (once):
    1. Install Ollama from https://ollama.com and start it.
    2. ollama pull llama3.2:3b

Settings can be overridden with environment variables:
    RAG_LLM_MODEL     (default llama3.2:3b)
    RAG_OLLAMA_URL    (default http://localhost:11434)
    RAG_LLM_TIMEOUT   seconds (default 180; a 3B model on CPU can be slow)

Design notes
------------
- temperature is low (0.1): this is a factual task, not creative writing.
- num_ctx is set explicitly to 4096. Ollama's default context window can
  be smaller than prompt + retrieved chunks, and when the prompt does not
  fit it is silently truncated -- the model would then answer without
  having seen part of the context.
- Any LLM backend can be swapped in: generator.py only needs an object
  with a `model` attribute and `generate(system, user) -> str`.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Protocol

DEFAULT_MODEL = os.environ.get("RAG_LLM_MODEL", "llama3.2:3b")
DEFAULT_BASE_URL = os.environ.get("RAG_OLLAMA_URL", "http://localhost:11434")
DEFAULT_TIMEOUT_S = float(os.environ.get("RAG_LLM_TIMEOUT", "180"))
DEFAULT_TEMPERATURE = 0.1
DEFAULT_NUM_CTX = 4096


class LLMError(RuntimeError):
    """The LLM call failed (bad model name, bad response, ...)."""


class LLMUnavailableError(LLMError):
    """The LLM server could not be reached at all (not running, timeout)."""


class LLMClient(Protocol):
    """What generator.py needs from any LLM backend."""

    model: str

    def generate(self, system: str, user: str) -> str: ...


class OllamaClient:
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        temperature: float = DEFAULT_TEMPERATURE,
        num_ctx: int = DEFAULT_NUM_CTX,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.temperature = temperature
        self.num_ctx = num_ctx

    def generate(self, system: str, user: str) -> str:
        """Send one system+user prompt and return the model's text."""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"temperature": self.temperature, "num_ctx": self.num_ctx},
        }
        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            if exc.code == 404:
                raise LLMError(
                    f"Model {self.model!r} was not found in Ollama. "
                    f"Download it with:  ollama pull {self.model}"
                ) from exc
            raise LLMError(f"Ollama returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
            raise LLMUnavailableError(
                f"Could not reach Ollama at {self.base_url} ({exc}). "
                "Is it running? Start the Ollama app, or run:  ollama serve"
            ) from exc
        except json.JSONDecodeError as exc:
            raise LLMError("Ollama returned a response that is not valid JSON.") from exc

        text = (body.get("message") or {}).get("content") if isinstance(body, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise LLMError("Ollama returned an empty response.")
        return text.strip()
