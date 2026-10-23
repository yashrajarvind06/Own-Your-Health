"""Secure share links: the patient picks records + duration; anyone holding the link can view only those, until expiry or revoke."""
import io
import re
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models import AuditLog, MedicalReport, ShareLink, User
from app.services.family import acting_patient, log_on_behalf
from app.services.records import serialize

router = APIRouter()
DURATIONS = {"1h": timedelta(hours=1), "1d": timedelta(days=1), "7d": timedelta(days=7)}
MAX_REPORTS = 20


class ShareBody(BaseModel):
    report_ids: List[int]
    duration: str = "1d"
    note: Optional[str] = None
    patient_id: Optional[int] = None  # a caregiver sharing for a family member


def _out(link: ShareLink) -> dict:
    return {"id": link.id, "token": link.token, "report_count": len(link.report_ids), "note": link.note,
            "expires_at": link.expires_at.isoformat(), "view_count": link.view_count,
            "last_viewed_at": link.last_viewed_at.isoformat() if link.last_viewed_at else None}


@router.post("")
def create_link(body: ShareBody, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    target, link = acting_patient(db, user, body.patient_id, "APPROVE_ACCESS")  # sharing = granting access
    if body.duration not in DURATIONS:
        raise HTTPException(status_code=422, detail=f"duration must be one of {', '.join(DURATIONS)}")
    ids = sorted(set(body.report_ids))
    if not 1 <= len(ids) <= MAX_REPORTS:
        raise HTTPException(status_code=422, detail=f"Choose 1-{MAX_REPORTS} records")
    owned = db.query(MedicalReport.id).filter(MedicalReport.id.in_(ids), MedicalReport.patient_id == target,
                                              MedicalReport.deleted_at.is_(None)).count()
    if owned != len(ids):
        raise HTTPException(status_code=404, detail="Some records were not found")
    share = ShareLink(token=secrets.token_urlsafe(32), patient_id=target, created_by=user.id, report_ids=ids,
                      note=(body.note or "").strip()[:120] or None, expires_at=datetime.utcnow() + DURATIONS[body.duration])
    db.add(share)
    db.add(AuditLog(actor_user_id=user.id, patient_id=target,
                    details=f"Event: SHARE_LINK_CREATED, Records: {len(ids)}, Duration: {body.duration}{log_on_behalf(db, user, link, 'shared_records')}"))
    db.commit()
    return _out(share)


@router.get("")
def my_links(patient_id: Optional[int] = None, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    target, _ = acting_patient(db, user, patient_id, "APPROVE_ACCESS")
    rows = db.query(ShareLink).filter(ShareLink.patient_id == target, ShareLink.revoked_at.is_(None),
                                      ShareLink.expires_at > datetime.utcnow()).order_by(ShareLink.created_at.desc()).all()
    return [_out(r) for r in rows]


@router.delete("/{link_id}")
def revoke_link(link_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    share = db.get(ShareLink, link_id)
    if not share:
        raise HTTPException(status_code=404, detail="Link not found")
    try:
        acting_patient(db, user, share.patient_id, "APPROVE_ACCESS")
    except HTTPException:
        raise HTTPException(status_code=404, detail="Link not found")
    share.revoked_at = datetime.utcnow()
    db.add(AuditLog(actor_user_id=user.id, patient_id=share.patient_id, details="Event: SHARE_LINK_REVOKED"))
    db.commit()
    return {"revoked": True}


@router.get("/view/{token}")
def view_shared(token: str, request: Request, db: Session = Depends(get_db)):
    """Public: the link itself is the credential. Every view is logged for the patient."""
    share = db.query(ShareLink).filter(ShareLink.token == token).first()
    now = datetime.utcnow()
    if not share or share.revoked_at or share.expires_at <= now:
        raise HTTPException(status_code=404, detail="This link has expired or was revoked")
    reports = db.query(MedicalReport).filter(MedicalReport.id.in_(share.report_ids), MedicalReport.deleted_at.is_(None)).all()
    share.view_count += 1
    share.last_viewed_at = now
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
    db.add(AuditLog(actor_user_id=share.created_by, patient_id=share.patient_id,
                    details=f"Event: SHARE_LINK_VIEWED, Link: {share.id}, IP: {ip}, Device: {request.headers.get('user-agent', '?')[:80]}"))
    db.commit()
    patient = db.get(User, share.patient_id)
    out = [serialize(r) for r in reports]
    out.sort(key=lambda r: r["record_date"], reverse=True)
    return {"patient_name": patient.display_name if patient else None, "abha_verified": bool(patient and patient.abha_verified_at),
            "note": share.note, "expires_at": share.expires_at.isoformat(), "records": out}


@router.get("/qr")
def share_qr(url: str):
    """QR image for a share URL. Only encodes URLs ending in /s/<token>, so it can't be used as a generic QR service."""
    if not re.fullmatch(r"https?://[^\s/]+/s/[A-Za-z0-9_-]{20,64}", url):
        raise HTTPException(status_code=422, detail="Not a share link")
    img = qrcode.make(url, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
