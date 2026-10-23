"""Family/caregiver delegation: lets a verified family member act for a patient within granted permissions."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import AuditLog, FamilyDelegate, User
from app.services.misuse import record_delegate_view

PERMISSIONS = ("EMERGENCY", "VIEW_RECORDS", "UPLOAD", "APPROVE_ACCESS")


def active_links_query(db: Session, delegate: User):
    """Delegates are matched by verified phone, so a member who signs up after being added is picked up."""
    if not delegate.phone or not delegate.phone_verified_at:
        return None
    return db.query(FamilyDelegate).filter(
        FamilyDelegate.phone == delegate.phone,
        FamilyDelegate.verified_at.isnot(None),
        FamilyDelegate.revoked_at.is_(None),
        or_(FamilyDelegate.expires_at.is_(None), FamilyDelegate.expires_at > datetime.utcnow()),
    )


def active_delegation(db: Session, delegate: User, patient_id: int) -> FamilyDelegate | None:
    q = active_links_query(db, delegate)
    return q.filter(FamilyDelegate.patient_id == patient_id).first() if q is not None else None


def acting_patient(db: Session, user: User, patient_id: int | None, permission: str) -> tuple[int, FamilyDelegate | None]:
    """Resolve whose data a patient-role caller is acting on.

    No patient_id (or own id) -> the caller themself. Otherwise the caller must be an
    active delegate of that patient holding `permission`.
    """
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients and their family delegates can do this")
    if patient_id is None or patient_id == user.id:
        return user.id, None
    link = active_delegation(db, user, patient_id)
    if not link or permission not in (link.permissions or []):
        raise HTTPException(status_code=403, detail=f"You don't have '{permission}' permission for this family member")
    return patient_id, link


def log_on_behalf(db: Session, actor: User, link: FamilyDelegate | None, action: str) -> str:
    """Write the docx-style audit line when a delegate acts; returns the suffix for other log lines."""
    if not link:
        return ""
    patient = db.get(User, link.patient_id)
    who = f"{actor.display_name or actor.email} ({link.relation})"
    db.add(AuditLog(actor_user_id=actor.id, patient_id=link.patient_id,
                    details=f"Action: family_{action}, Delegate: {who}, OnBehalfOf: {patient.display_name if patient else link.patient_id}"))
    db.commit()
    if action.startswith("view"):
        record_delegate_view(db, actor, link.patient_id)
    return f", OnBehalfOf: {link.patient_id}, Delegate: {who}"
