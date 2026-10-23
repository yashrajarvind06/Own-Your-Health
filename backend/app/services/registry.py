"""ABDM registry lookups (HPR for doctors, HFR for labs).

Mock: reads JSON fixtures. To use the ABDM sandbox, replace the body of `lookup` only.
"""
import json
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import User

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
REGISTRY_BY_ROLE = {"doctor": "hpr", "lab": "hfr"}


def lookup(role: str, registry_id: str) -> dict | None:
    registry = REGISTRY_BY_ROLE.get(role)
    if not registry:
        return None
    records = json.loads((_FIXTURES / f"{registry}.json").read_text(encoding="utf-8"))
    return records.get((registry_id or "").strip().upper())


def verify_user(db: Session, user: User, registry_id: str) -> None:
    """Attach a registry ID to a doctor/lab and mark them verified, or raise 400/409."""
    registry_id = (registry_id or "").strip().upper()
    if lookup(user.role, registry_id) is None:
        raise HTTPException(status_code=400, detail=f"{REGISTRY_BY_ROLE[user.role].upper()} ID not found in registry")
    taken = db.query(User).filter(User.registry_id == registry_id, User.id != user.id).first()
    if taken:
        raise HTTPException(status_code=409, detail="This registry ID is already linked to another account")
    user.registry_id = registry_id
    user.verified_at = datetime.utcnow()


def normalize_abha(abha_number: str) -> str:
    """Accept 14 digits with or without dashes; return the XX-XXXX-XXXX-XXXX form."""
    digits = "".join(c for c in (abha_number or "") if c.isdigit())
    return f"{digits[:2]}-{digits[2:6]}-{digits[6:10]}-{digits[10:]}" if len(digits) == 14 else ""


def abha_lookup(abha_number: str) -> dict | None:
    records = json.loads((_FIXTURES / "abha.json").read_text(encoding="utf-8"))
    return records.get(normalize_abha(abha_number))
