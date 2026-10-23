"""Family / caregiver mode (docx add-on): add a member by OTP, choose permissions, time-limit, revoke anytime."""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models import AuditLog, EmergencyQRProfile, FamilyDelegate, User
from app.services.family import PERMISSIONS, acting_patient, active_links_query, log_on_behalf
from app.services.otp import check_otp, mask, normalize_phone, send_otp

router = APIRouter()
RELATIONS = ("Son", "Daughter", "Spouse", "Parent", "Grandson", "Granddaughter", "Sibling", "Caregiver", "Other")


def _serialize(link: FamilyDelegate) -> dict:
    return {
        "id": link.id,
        "name": link.name,
        "relation": link.relation,
        "phone": mask(link.phone),
        "permissions": link.permissions or [],
        "is_primary_caregiver": link.is_primary_caregiver,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "verified": link.verified_at is not None,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


class MemberBody(BaseModel):
    permissions: List[str]
    is_primary_caregiver: bool = False
    duration_days: Optional[int] = None  # None = permanent until revoked


class AddMemberBody(MemberBody):
    name: str
    relation: str
    phone: str


def _validate(body: MemberBody) -> None:
    bad = set(body.permissions) - set(PERMISSIONS)
    if bad or not body.permissions:
        raise HTTPException(status_code=422, detail=f"Choose at least one of: {', '.join(PERMISSIONS)}")
    if body.duration_days is not None and not 1 <= body.duration_days <= 365:
        raise HTTPException(status_code=422, detail="Temporary access must be 1-365 days")


def _own_link(db: Session, patient: User, link_id: int) -> FamilyDelegate:
    link = db.query(FamilyDelegate).filter(FamilyDelegate.id == link_id, FamilyDelegate.patient_id == patient.id,
                                           FamilyDelegate.revoked_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Family member not found")
    return link


@router.get("/members")
def list_members(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    links = db.query(FamilyDelegate).filter(FamilyDelegate.patient_id == user.id, FamilyDelegate.revoked_at.is_(None)).all()
    return [_serialize(l) for l in links]


@router.post("/members")
def add_member(body: AddMemberBody, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Step 1: create the link and send an OTP to the member's phone. Not active until /verify."""
    _validate(body)
    phone = normalize_phone(body.phone)
    if phone == user.phone:
        raise HTTPException(status_code=422, detail="You can't add yourself")
    if body.relation not in RELATIONS or not body.name.strip():
        raise HTTPException(status_code=422, detail=f"Relation must be one of: {', '.join(RELATIONS)}")
    if db.query(FamilyDelegate).filter(FamilyDelegate.patient_id == user.id, FamilyDelegate.phone == phone,
                                       FamilyDelegate.revoked_at.is_(None)).first():
        raise HTTPException(status_code=409, detail="This number is already a family member")
    link = FamilyDelegate(
        patient_id=user.id, name=body.name.strip(), relation=body.relation, phone=phone,
        permissions=body.permissions, is_primary_caregiver=body.is_primary_caregiver,
        expires_at=datetime.utcnow() + timedelta(days=body.duration_days) if body.duration_days else None,
    )
    db.add(link)
    db.commit()
    return {"member": _serialize(link), **send_otp(db, phone, "FAMILY_LINK")}


class VerifyBody(BaseModel):
    code: str


@router.post("/members/{link_id}/verify")
def verify_member(link_id: int, body: VerifyBody, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Step 2: the member reads out the OTP they received; this confirms it's the right person."""
    link = _own_link(db, user, link_id)
    check_otp(db, link.phone, "FAMILY_LINK", body.code)
    link.verified_at = datetime.utcnow()
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id,
                    details=f"Action: family_added, Member: {link.name} ({link.relation}), Permissions: {', '.join(link.permissions)}"))
    db.commit()
    return _serialize(link)


@router.patch("/members/{link_id}")
def update_member(link_id: int, body: MemberBody, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    _validate(body)
    link = _own_link(db, user, link_id)
    link.permissions, link.is_primary_caregiver = body.permissions, body.is_primary_caregiver
    link.expires_at = datetime.utcnow() + timedelta(days=body.duration_days) if body.duration_days else None
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id,
                    details=f"Action: family_permissions_changed, Member: {link.name} ({link.relation}), Permissions: {', '.join(link.permissions)}"))
    db.commit()
    return _serialize(link)


@router.delete("/members/{link_id}")
def remove_member(link_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Access stops instantly. No explanation needed."""
    link = _own_link(db, user, link_id)
    link.revoked_at = datetime.utcnow()
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: family_removed, Member: {link.name} ({link.relation})"))
    db.commit()
    return {"removed": True}


@router.get("/caring-for")
def caring_for(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """People who have made the caller their family delegate."""
    q = active_links_query(db, user)
    links = q.all() if q is not None else []
    return [{**_serialize(l), "patient_id": l.patient_id,
             "patient_name": l.patient.display_name if l.patient else None} for l in links]


@router.get("/activity")
def family_activity(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """What family members did on the caller's account (docx: actions are logged clearly)."""
    logs = db.query(AuditLog).filter(AuditLog.patient_id == user.id, AuditLog.details.like("Action: family_%")) \
        .order_by(AuditLog.created_at.desc()).limit(100).all()
    return [{"id": l.id, "details": l.details, "created_at": l.created_at.isoformat()} for l in logs]


@router.get("/emergency/{patient_id}")
def delegate_emergency_info(patient_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    _, link = acting_patient(db, user, patient_id, "EMERGENCY")
    log_on_behalf(db, user, link, "view_emergency_info")
    p = db.query(EmergencyQRProfile).filter(EmergencyQRProfile.patient_id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="No emergency profile saved yet")
    fields = ("name", "age", "gender", "blood_group", "allergies", "chronic_conditions", "medications",
              "surgeries", "emergency_contact", "organ_donor_status", "pregnancy_status")
    return {f: getattr(p, f) for f in fields}
