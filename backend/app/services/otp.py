"""One-time codes for phone verification (login, ABHA linking, family links).

Mock delivery: there is no SMS gateway, so codes are printed to the server log and, while
OTP_DEV_ECHO is on (default), returned in the API response so demos work on a phone.
"""
import os
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import get_password_hash, verify_password
from app.models import OtpCode

TTL = timedelta(minutes=5)
MAX_ATTEMPTS = 5
MAX_SENDS_PER_10_MIN = 3
DEV_ECHO = os.getenv("OTP_DEV_ECHO", "1") == "1"


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())[-10:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise HTTPException(status_code=422, detail="Enter a valid 10-digit Indian mobile number")
    return digits


def mask(phone: str) -> str:
    return "XXXXXX" + phone[-4:]


def send_otp(db: Session, phone: str, purpose: str) -> dict:
    recent = db.query(OtpCode).filter(OtpCode.phone == phone, OtpCode.created_at > datetime.utcnow() - timedelta(minutes=10)).count()
    if recent >= MAX_SENDS_PER_10_MIN:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again in 10 minutes.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(OtpCode(phone=phone, purpose=purpose, code_hash=get_password_hash(code), expires_at=datetime.utcnow() + TTL))
    db.commit()
    print(f"[OTP] {purpose} code for {mask(phone)}: {code}")  # shortcut: mock SMS; plug in an SMS gateway for production
    return {"sent_to": mask(phone), **({"dev_otp": code} if DEV_ECHO else {})}


def check_otp(db: Session, phone: str, purpose: str, code: str) -> None:
    """Consume the latest live code for this phone+purpose, or raise 400."""
    otp = db.query(OtpCode).filter(
        OtpCode.phone == phone, OtpCode.purpose == purpose,
        OtpCode.consumed_at.is_(None), OtpCode.expires_at > datetime.utcnow(),
    ).order_by(OtpCode.created_at.desc()).first()
    if not otp or otp.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="OTP expired or not requested. Request a new one.")
    otp.attempts += 1
    if not verify_password((code or "").strip(), otp.code_hash):
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect OTP")
    otp.consumed_at = datetime.utcnow()
    db.commit()
