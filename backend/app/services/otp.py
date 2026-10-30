"""One-time codes for login, sign-up, password reset, ABHA linking and family links.

Delivery: there is no SMS gateway yet, so codes go by email (services/email.py) to the account's address.
While OTP_DEV_ECHO is on (default, local only) they are also returned in the API response.
A deployed server must set OTP_DEV_ECHO=0, or anyone could read any account's code.
"""
import os
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import get_password_hash, verify_password
from app.models import OtpCode, User
from app.services import email as mailer

TTL = timedelta(minutes=5)
MAX_ATTEMPTS = 5
MAX_SENDS_PER_10_MIN = 3
DEV_ECHO = os.getenv("OTP_DEV_ECHO", "1") == "1"
PLACEHOLDER_DOMAIN = "@users.ownyourhealth.in"


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())[-10:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise HTTPException(status_code=422, detail="Enter a valid 10-digit Indian mobile number")
    return digits


def mask(phone: str) -> str:
    return "XXXXXX" + phone[-4:]


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}***@{domain}"


def real_email(user: User | None) -> str | None:
    """OTP-created accounts have a placeholder address that can't receive mail."""
    return user.email if user and not user.email.endswith(PLACEHOLDER_DOMAIN) else None


def _issue(db: Session, key: str, purpose: str) -> str:
    recent = db.query(OtpCode).filter(OtpCode.phone == key, OtpCode.created_at > datetime.utcnow() - timedelta(minutes=10)).count()
    if recent >= MAX_SENDS_PER_10_MIN:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again in 10 minutes.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(OtpCode(phone=key, purpose=purpose, code_hash=get_password_hash(code), expires_at=datetime.utcnow() + TTL))
    db.commit()
    return code


def send_email_otp(db: Session, address: str, purpose: str, key: str | None = None) -> dict:
    """Email a code. `key` is what check_otp will look it up by (defaults to the address itself)."""
    if not mailer.enabled() and not DEV_ECHO:
        raise HTTPException(status_code=503, detail="Email isn't set up on this server yet.")
    code = _issue(db, key or address, purpose)
    if mailer.enabled():
        mailer.send_email(address, f"Your OwnYourHealth code is {code}",
                          f"Your OwnYourHealth verification code is {code}.\n\n"
                          "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.")
    return {"sent_to": mask_email(address), **({"dev_otp": code} if DEV_ECHO else {})}


def send_otp(db: Session, phone: str, purpose: str, email: str | None = None) -> dict:
    """Code for a phone number. shortcut: no SMS gateway, so it goes to `email` or the email of the
    account holding this number; add an SMS provider here to deliver to the phone itself."""
    if DEV_ECHO and not mailer.enabled():
        code = _issue(db, phone, purpose)
        print(f"[OTP] {purpose} code for {mask(phone)}: {code}")
        return {"sent_to": mask(phone), "dev_otp": code}
    owner = db.query(User).filter(User.phone == phone).first()
    # A family link grants access to records, so it needs a number the holder has actually proven
    if purpose == "FAMILY_LINK" and not (owner and owner.phone_verified_at):
        raise HTTPException(status_code=503, detail="Family members must have a verified mobile number. SMS verification isn't switched on yet.")
    address = email or real_email(owner)
    if not address:
        raise HTTPException(status_code=404, detail="No account with an email for this number yet. Tap Create account first.")
    return send_email_otp(db, address, purpose, key=phone)


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
