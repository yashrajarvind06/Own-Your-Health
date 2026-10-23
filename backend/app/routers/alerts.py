"""Misuse alerts for the patient (or a caregiver who can approve access for them)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models import Alert, User
from app.services.family import acting_patient

router = APIRouter()


@router.get("")
def list_alerts(patient_id: Optional[int] = None, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    target, _ = acting_patient(db, user, patient_id, "APPROVE_ACCESS")
    rows = db.query(Alert).filter(Alert.patient_id == target).order_by(Alert.created_at.desc()).limit(50).all()
    return [{"id": a.id, "rule": a.rule, "message": a.message, "created_at": a.created_at.isoformat(), "seen": a.seen_at is not None}
            for a in rows]


@router.post("/{alert_id}/seen")
def mark_seen(alert_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    try:
        acting_patient(db, user, alert.patient_id, "APPROVE_ACCESS")
    except HTTPException:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.seen_at = alert.seen_at or datetime.utcnow()
    db.commit()
    return {"seen": True}
