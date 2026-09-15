"""Google Gemini AI integration for the AI Chat bot feature.

The Gemini API key is never hardcoded or exposed to the frontend. Resolution order:
1. GEMINI_API_KEY environment variable (Docker/runtime-injected secret), if set.
2. Fallback: download NS_CP_CODE/staticSiteContent/nsenvs/geminiapi.json from NetStorage
   (same credentials/pattern as the Grover X-API-KEY fallback) and read its "GEMINI_API_KEY" field.
"""

import json
import os
from pathlib import Path

import google.genai as genai
from google.genai import types

from backend.data_service import download_csv_from_netstorage, get_ns_config, get_storage_dir
from backend.job_manager import Job

GEMINI_API_KEY_NS_RELATIVE_PATH = Path("nsenvs") / "geminiapi.json"
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.0-flash")

# Cached once per process so we don't re-download the NetStorage file on every chat call.
_gemini_api_key_ns_cache: str | None = None


def fetch_gemini_api_key_from_netstorage(job: Job | None = None) -> str:
    """Download NS_CP_CODE/staticSiteContent/nsenvs/geminiapi.json and return its GEMINI_API_KEY field."""
    global _gemini_api_key_ns_cache
    if _gemini_api_key_ns_cache is not None:
        return _gemini_api_key_ns_cache

    cfg = get_ns_config()
    remote_path = "/" + "/".join(
        part for part in [cfg["cp_code"], cfg["base_path"], *GEMINI_API_KEY_NS_RELATIVE_PATH.parts] if part
    )
    local_path = get_storage_dir() / "ns_json_cache" / GEMINI_API_KEY_NS_RELATIVE_PATH

    download_csv_from_netstorage(remote_path, local_path, job)
    payload = json.loads(local_path.read_text(encoding="utf-8"))
    api_key = str(payload.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(f"{GEMINI_API_KEY_NS_RELATIVE_PATH} did not contain a non-empty GEMINI_API_KEY field")
    _gemini_api_key_ns_cache = api_key
    return api_key


def get_gemini_api_key(job: Job | None = None) -> str:
    """Resolve the Gemini API key: GEMINI_API_KEY env var first, falling back to NetStorage."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key:
        return api_key

    if job:
        job.log("GEMINI_API_KEY not set in environment; falling back to NetStorage geminiapi.json", percent=5)
    return fetch_gemini_api_key_from_netstorage(job)


def generate_reply(
    system_instruction: str,
    history: list[dict[str, str]],
    user_message: str,
    job: Job | None = None,
) -> str:
    """Send a chat turn to Gemini and return the assistant's text reply.

    `history` is a list of {"role": "user" | "model", "text": str} prior turns for this session."""
    try:
        client = genai.Client(api_key=get_gemini_api_key(job))
        chat_history = [
            types.Content(role=turn["role"], parts=[types.Part(text=turn["text"])]) for turn in history
        ]
        chat = client.chats.create(
            model=GEMINI_MODEL_NAME,
            history=chat_history,
            config=types.GenerateContentConfig(system_instruction=system_instruction),
        )
        response = chat.send_message(user_message)
        text = getattr(response, "text", None)
        if not text:
            raise ValueError("Gemini returned an empty response")
        return text
    except Exception as error:
        raise ValueError(f"Gemini request failed: {error}") from error
