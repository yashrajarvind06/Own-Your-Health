import os

import secrets
from pathlib import Path


def _secret_key() -> str:
    """SECRET_KEY env var, else a random key generated once and kept in backend/.secret_key (gitignored).
    Never a hard-coded default: it signs login tokens and file links, so a known key lets anyone forge them."""
    if os.getenv("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = Path(__file__).resolve().parents[1] / ".secret_key"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


SECRET_KEY = _secret_key()
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
