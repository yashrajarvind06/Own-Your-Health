"""Short-lived signed URLs for locally stored files (the local stand-in for S3 presigned URLs)."""
import hashlib
import hmac
import os
import time
from pathlib import Path
from urllib.parse import quote

from app.config import SECRET_KEY

STORAGE_ROOT = Path("storage").resolve()
TTL_SECONDS = 300


def _sig(key: str, exp: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"{key}|{exp}".encode(), hashlib.sha256).hexdigest()


def signed_url(key: str, ttl: int = TTL_SECONDS) -> str:
    exp = int(time.time()) + ttl
    return f"/api/files/{quote(key)}?exp={exp}&sig={_sig(key, exp)}"


def get_s3():
    key, secret, bucket = os.getenv("AWS_ACCESS_KEY_ID"), os.getenv("AWS_SECRET_ACCESS_KEY"), os.getenv("S3_BUCKET")
    if not key or not secret or not bucket:
        return None, None
    import boto3
    return boto3.client("s3", aws_access_key_id=key, aws_secret_access_key=secret,
                        region_name=os.getenv("AWS_REGION", "us-east-1")), bucket


def file_url(key: str) -> str | None:
    """S3 presigned URL when S3 is configured, else a signed local link."""
    s3, bucket = get_s3()
    if s3:
        try:
            return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=TTL_SECONDS)
        except Exception:
            return None
    return signed_url(key)


def resolve_signed(key: str, exp: int, sig: str) -> Path | None:
    """Return the file path if the signature is valid, unexpired and inside storage, else None."""
    if exp < time.time() or not hmac.compare_digest(sig, _sig(key, exp)):
        return None
    path = (STORAGE_ROOT / key).resolve()
    if STORAGE_ROOT not in path.parents or not path.is_file():
        return None
    return path
