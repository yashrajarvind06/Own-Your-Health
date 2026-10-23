"""Self-check for signed file links. Run from backend/: python verify_security.py"""
import time
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

from app.services import file_urls

key = "reports/_selfcheck/a b.txt"
path = Path("storage") / key
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text("ok")
try:
    url = urlparse(file_urls.signed_url(key))
    q = parse_qs(url.query)
    got_key, exp, sig = unquote(url.path.removeprefix("/api/files/")), int(q["exp"][0]), q["sig"][0]

    assert got_key == key
    assert file_urls.resolve_signed(got_key, exp, sig) == path.resolve()
    assert file_urls.resolve_signed(got_key, exp, "0" * 64) is None                      # forged signature
    assert file_urls.resolve_signed("reports/_selfcheck/other.txt", exp, sig) is None    # signature is per-file
    assert file_urls.resolve_signed(got_key, exp + 1, sig) is None                       # can't extend expiry
    stale = int(time.time()) - 1
    assert file_urls.resolve_signed(got_key, stale, file_urls._sig(got_key, stale)) is None  # expired
    escape = "../app/config.py"
    assert file_urls.resolve_signed(escape, exp, file_urls._sig(escape, exp)) is None    # outside storage
    print("signed file links: all checks passed")
finally:
    path.unlink()
    path.parent.rmdir()

# App screens must not share a path with a GET API route: the backend serves the patient PWA,
# and an API route would answer a page load with JSON (e.g. the /share screen vs a /share API).
import os
import re
os.environ.setdefault("DATABASE_URL", "sqlite://")
from app.main import app  # noqa: E402

api_paths = [r.path for r in app.routes if "GET" in getattr(r, "methods", set()) and r.path != "/{path:path}"]
pages_dir = os.path.join(os.path.dirname(__file__), "..", "mobile", "src", "app")
clashes = []
for root, _, files in os.walk(pages_dir):
    for f in files:
        page = os.path.relpath(os.path.join(root, f), pages_dir).replace(os.sep, "/")
        if f.startswith("_") or not f.endswith(".tsx"):
            continue
        page = "/" + re.sub(r"(^|/)index$", "", re.sub(r"\([^)]*\)/", "", page[:-4]))
        sample = re.sub(r"\[[^\]]+\]", "x", page)
        if any(re.fullmatch(re.sub(r"\{[^}]+\}", "[^/]+", a), sample) for a in api_paths):
            clashes.append(page)
assert not clashes, f"app screens shadowed by API routes: {clashes}"
print("app routes vs API routes: no clashes")
