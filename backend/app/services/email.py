"""Transactional email through Brevo's HTTP API (BREVO_API_KEY, EMAIL_FROM in backend/.env).

HTTP rather than SMTP: Render's free tier blocks outbound SMTP ports.
"""
import os

import requests
from fastapi import HTTPException

URL = "https://api.brevo.com/v3/smtp/email"


def enabled() -> bool:
    return bool(os.getenv("BREVO_API_KEY") and os.getenv("EMAIL_FROM"))


def send_email(to: str, subject: str, text: str) -> None:
    try:
        res = requests.post(URL, headers={"api-key": os.environ["BREVO_API_KEY"]}, timeout=20, json={
            "sender": {"name": "OwnYourHealth", "email": os.environ["EMAIL_FROM"]},
            "to": [{"email": to}], "subject": subject, "textContent": text,
        })
        res.raise_for_status()
    except requests.RequestException as e:  # never log the body: it holds the code
        print(f"Email failed: {type(e).__name__} {getattr(getattr(e, 'response', None), 'status_code', '')}")
        raise HTTPException(status_code=502, detail="Couldn't send the email. Try again in a minute.")
