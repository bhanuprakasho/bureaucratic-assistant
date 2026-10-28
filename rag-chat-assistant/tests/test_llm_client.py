"""Tests for src/generation/llm_client.py. No Ollama server is needed:
urllib's urlopen is replaced with a fake."""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from src.generation.llm_client import LLMError, LLMUnavailableError, OllamaClient


class _FakeResponse:
    def __init__(self, payload: dict | bytes):
        self._raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _patch_urlopen(monkeypatch, behaviour):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return behaviour()

    monkeypatch.setattr("src.generation.llm_client.urllib.request.urlopen", fake_urlopen)
    return captured


def test_generate_returns_message_text_and_sends_expected_payload(monkeypatch):
    captured = _patch_urlopen(
        monkeypatch, lambda: _FakeResponse({"message": {"role": "assistant", "content": "  Hello  "}})
    )
    client = OllamaClient(model="m1", base_url="http://host:1234/", timeout_s=7, temperature=0.2, num_ctx=2048)

    assert client.generate("SYS", "USER") == "Hello"

    assert captured["url"] == "http://host:1234/api/chat"
    assert captured["timeout"] == 7
    body = captured["body"]
    assert body["model"] == "m1"
    assert body["stream"] is False
    assert body["options"] == {"temperature": 0.2, "num_ctx": 2048}
    assert body["messages"] == [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "USER"},
    ]


def test_server_not_running_raises_unavailable(monkeypatch):
    def boom():
        raise urllib.error.URLError(ConnectionRefusedError("refused"))

    _patch_urlopen(monkeypatch, boom)
    with pytest.raises(LLMUnavailableError) as exc:
        OllamaClient().generate("s", "u")
    assert "ollama" in str(exc.value).lower()


def test_timeout_raises_unavailable(monkeypatch):
    def boom():
        raise TimeoutError("timed out")

    _patch_urlopen(monkeypatch, boom)
    with pytest.raises(LLMUnavailableError):
        OllamaClient().generate("s", "u")


def test_missing_model_gives_pull_instruction(monkeypatch):
    def boom():
        raise urllib.error.HTTPError(
            "http://x", 404, "Not Found", {}, io.BytesIO(b'{"error":"model not found"}')
        )

    _patch_urlopen(monkeypatch, boom)
    with pytest.raises(LLMError) as exc:
        OllamaClient(model="llama3.2:3b").generate("s", "u")
    assert "ollama pull llama3.2:3b" in str(exc.value)
    assert not isinstance(exc.value, LLMUnavailableError)


def test_other_http_error_includes_status(monkeypatch):
    def boom():
        raise urllib.error.HTTPError("http://x", 500, "Server Error", {}, io.BytesIO(b"oops"))

    _patch_urlopen(monkeypatch, boom)
    with pytest.raises(LLMError) as exc:
        OllamaClient().generate("s", "u")
    assert "500" in str(exc.value)


def test_empty_response_raises(monkeypatch):
    _patch_urlopen(monkeypatch, lambda: _FakeResponse({"message": {"content": "   "}}))
    with pytest.raises(LLMError):
        OllamaClient().generate("s", "u")


def test_invalid_json_raises(monkeypatch):
    _patch_urlopen(monkeypatch, lambda: _FakeResponse(b"not json"))
    with pytest.raises(LLMError):
        OllamaClient().generate("s", "u")
