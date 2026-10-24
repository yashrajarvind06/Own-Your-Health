"""Health history: generate it, read it, share it with a doctor (who can read only what is shared)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.deps import get_db, require_role
from app.models import ActiveAccessSession, AuditLog, HealthHistory, HealthHistoryShare, User
from app.services import health_history
from app.services.family import acting_patient, log_on_behalf
from app.services.misuse import record_doctor_access

router = APIRouter()


def _history(db: Session, patient_id: int) -> HealthHistory | None:
    return db.query(HealthHistory).filter(HealthHistory.patient_id == patient_id).first()


@router.get("")
def get_history(patient_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target, _ = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    return health_history.serialize(db, target, _history(db, target))


@router.post("/generate")
def generate(patient_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target, link = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    log_on_behalf(db, user, link, "generate_health_history")
    h = health_history.generate(db, db.get(User, target))
    return health_history.serialize(db, target, h)


@router.get("/doctors")
def share_candidates(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Doctors the patient has had a consent session with, active ones first."""
    now = datetime.utcnow()
    rows = (db.query(ActiveAccessSession, User).join(User, ActiveAccessSession.doctor_id == User.id)
            .filter(ActiveAccessSession.patient_id == user.id).order_by(ActiveAccessSession.created_at.desc()).all())
    out: dict[int, dict] = {}
    for s, d in rows:
        active = s.revoked_at is None and s.expires_at > now
        row = out.setdefault(d.id, {"doctor_id": d.id, "doctor_name": d.display_name or d.email, "active": False,
                                    "remaining_seconds": 0, "last_seen": s.created_at.isoformat() if s.created_at else None})
        if active:
            row["active"] = True
            row["remaining_seconds"] = max(row["remaining_seconds"], int((s.expires_at - now).total_seconds()))
    return sorted(out.values(), key=lambda r: not r["active"])


class ShareBody(BaseModel):
    doctor_id: int


@router.post("/share")
def share(body: ShareBody, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    if not _history(db, user.id):
        raise HTTPException(status_code=409, detail="Generate your health history first")
    seen = db.query(ActiveAccessSession).filter(ActiveAccessSession.patient_id == user.id, ActiveAccessSession.doctor_id == body.doctor_id).first()
    if not seen:  # only doctors the patient has actually consulted
        raise HTTPException(status_code=404, detail="Doctor not found in your access history")
    exists = db.query(HealthHistoryShare).filter(HealthHistoryShare.patient_id == user.id, HealthHistoryShare.doctor_id == body.doctor_id,
                                                 HealthHistoryShare.revoked_at.is_(None)).first()
    if not exists:
        db.add(HealthHistoryShare(patient_id=user.id, doctor_id=body.doctor_id))
        db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: share_health_history, Doctor: {body.doctor_id}"))
        db.commit()
    return health_history.serialize(db, user.id, _history(db, user.id))


@router.delete("/share/{doctor_id}")
def unshare(doctor_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    db.query(HealthHistoryShare).filter(HealthHistoryShare.patient_id == user.id, HealthHistoryShare.doctor_id == doctor_id,
                                        HealthHistoryShare.revoked_at.is_(None)).update({"revoked_at": datetime.utcnow()})
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: unshare_health_history, Doctor: {doctor_id}"))
    db.commit()
    return health_history.serialize(db, user.id, _history(db, user.id))


@router.get("/shared/{patient_id}")
def shared_history(patient_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    """What a patient shared with this doctor. 404 (not 403) when nothing is shared, so it reveals nothing."""
    share = db.query(HealthHistoryShare).filter(HealthHistoryShare.patient_id == patient_id, HealthHistoryShare.doctor_id == doctor.id,
                                                HealthHistoryShare.revoked_at.is_(None)).first()
    h = _history(db, patient_id)
    if not share or not h:
        raise HTTPException(status_code=404, detail="No health history shared with you")
    record_doctor_access(db, doctor, patient_id, "shared health history")
    return {**h.content, "source": h.source, "report_count": h.report_count, "generated_at": h.generated_at.isoformat(),
            "shared_at": share.created_at.isoformat()}
