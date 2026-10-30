"""Deployed-mode OTP checks: codes go by email and never appear in API responses.

Run: python verify_email_delivery.py   (uses the local database; Brevo is stubbed, nothing is really sent)
"""
import os
import re
import uuid
from types import SimpleNamespace

os.environ.update(OTP_DEV_ECHO="0", BREVO_API_KEY="stub", EMAIL_FROM="noreply@example.com", GEMINI_API_KEY="")

from fastapi import HTTPException

from app.database import SessionLocal
from app.models import User
from app.routers.auth import OtpRequest, OtpVerify, SignupBody, otp_request, otp_verify, signup
from app.services import email as mailer
from app.services.otp import send_otp

sent = []


def fake_post(url, headers, json, timeout):
    assert url == mailer.URL and headers["api-key"] == "stub" and json["sender"]["email"] == "noreply@example.com"
    sent.append(json)
    return SimpleNamespace(raise_for_status=lambda: None)


mailer.requests.post = fake_post
db = SessionLocal()
email, phone = f"delivery.{uuid.uuid4().hex[:8]}@example.com", "6" + uuid.uuid4().int.__str__()[:9]


def code():
    return re.search(r"\b(\d{6})\b", sent[-1]["textContent"]).group(1)


def status_of(fn):
    try:
        fn()
    except HTTPException as e:
        return e.status_code
    return 200


details = dict(display_name="Delivery Test", phone=phone, email=email, password="correct-horse-1")
out = signup(SignupBody(**details), db)
assert "dev_otp" not in out and sent[-1]["to"] == [{"email": email}], out
assert out["sent_to"].endswith("@example.com") and email not in out["sent_to"], out
signup(SignupBody(**details, code=code()), db)
user = db.query(User).filter(User.email == email).one()
assert user.phone == phone and user.phone_verified_at is None

out = otp_request(OtpRequest(phone=phone), db)
assert "dev_otp" not in out and sent[-1]["to"] == [{"email": email}], out
otp_verify(OtpVerify(phone=phone, code=code()), db)
db.refresh(user)
assert user.phone_verified_at is None, "an emailed code must not mark the phone verified"

unknown = "6" + uuid.uuid4().int.__str__()[:9]
assert status_of(lambda: otp_request(OtpRequest(phone=unknown), db)) == 404
assert status_of(lambda: send_otp(db, phone, "FAMILY_LINK")) == 503  # unverified number can't become a caregiver

# Placeholder addresses can't receive mail, so they must never be emailed
ghost = User(email=f"patient.{unknown}@users.ownyourhealth.in", hashed_password="x", role="patient", phone=unknown)
db.add(ghost)
db.commit()
before = len(sent)
assert status_of(lambda: otp_request(OtpRequest(phone=unknown), db)) == 404 and len(sent) == before

db.delete(ghost)
db.commit()
print("ALL PASSED")
