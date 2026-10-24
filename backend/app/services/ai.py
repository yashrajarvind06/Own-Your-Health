"""Google Gemini for record summaries (GEMINI_API_KEY in backend/.env).

Every call returns None when no key is set or Gemini fails, so callers fall back to the rule-based
summaries and the app keeps working offline.
"""
import base64
import json
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Tried in order: a model that is busy (429/503) or retired (404) falls through to the next
MODELS = [os.getenv("GEMINI_MODEL")] if os.getenv("GEMINI_MODEL") else ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]
URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
INLINE_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"}


def enabled() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def file_part(path: str, mime: str) -> dict | None:
    """The document itself, so Gemini can read scans the OCR could not."""
    mime = "image/jpeg" if mime == "image/jpg" else mime
    p = Path(path)
    if mime not in INLINE_MIME or not p.exists():
        return None
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(p.read_bytes()).decode()}}


def generate_json(system: str, parts: list, schema: dict, budget: int = 45) -> dict | None:
    """Stops after `budget` seconds in total, so a busy Gemini never leaves the user waiting for minutes."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [p for p in parts if p]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": 0.2,
                             "thinkingConfig": {"thinkingLevel": "low"}},  # summarising needs little reasoning; keeps it ~seconds
    }
    deadline = time.monotonic() + budget
    for model in MODELS:
        for attempt in range(2):  # a 503 spike is short: one retry, then the next model
            left = deadline - time.monotonic()
            if left < 5:
                print("Gemini: out of time, using the basic summary")
                return None
            try:
                res = requests.post(URL.format(model), headers={"x-goog-api-key": key}, json=body, timeout=min(left, 40))
            except requests.Timeout:
                print(f"Gemini {model} timed out")
                break
            except Exception as e:  # never log the request: it holds health data
                print(f"Gemini call failed on {model}: {type(e).__name__}")
                return None
            if res.status_code == 503 and attempt == 0:
                time.sleep(2)
                continue
            if res.status_code in (404, 429, 503):  # retired, out of quota or still busy: next model
                print(f"Gemini {model} unavailable ({res.status_code})")
                break
            try:
                res.raise_for_status()
                text = "".join(p.get("text", "") for p in res.json()["candidates"][0]["content"]["parts"] if not p.get("thought"))
                return json.loads(text)
            except Exception as e:
                print(f"Gemini call failed on {model}: {type(e).__name__} {res.status_code}")
                return None
    return None
