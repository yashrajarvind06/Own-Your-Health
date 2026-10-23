from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.auth import get_current_user
from app.models import ActiveAccessSession, DoctorEndorsement, DoctorFeedback, User
from app.services.trust import trust_score
from app.services.doctor_directory import build_doctor_directory
from app.services.access_service import AccessService

router = APIRouter()


@router.get("/doctors/search")
def search_doctors(
    q: str = "",
    _current_user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role == "doctor")
    search_term = (q or "").strip()

    if search_term:
        query = query.filter(User.display_name.ilike(f"%{search_term}%"))

    directory = build_doctor_directory(query.all())
    for doctor in directory:
        doctor["trust_score"] = trust_score(db, db.get(User, doctor["id"]))["score"]
    directory.sort(
        key=lambda doctor: (
            0 if doctor["verified"] else 1,
            -doctor["experience"],
            doctor["name"].lower(),
            doctor["id"],
        )
    )

    return {
        "top_doctors": [doctor for doctor in directory if doctor["verified"]],
        "other_doctors": [doctor for doctor in directory if not doctor["verified"]],
    }


@router.get("/doctor/patients/active")
def get_active_patients(
    current_user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    rows = AccessService(db).get_doctor_active_patients(current_user.id)
    return [
        {
            "patient_id": patient.id,
            "patient_name": patient.display_name or patient.email,
            "access_granted_at": access.access_granted_at.isoformat() if access.access_granted_at else None,
            "last_accessed_at": access.access_granted_at.isoformat() if access.access_granted_at else None,
            "is_active": access.is_active,
        }
        for access, patient in rows
    ]


@router.get("/doctor/patients/history")
def get_patient_history(
    current_user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    rows = AccessService(db).get_doctor_patient_history(current_user.id)
    return [
        {
            "patient_id": patient.id,
            "patient_name": patient.display_name or patient.email,
            "access_granted_at": access.access_granted_at.isoformat() if access.access_granted_at else None,
            "access_revoked_at": access.access_revoked_at.isoformat() if access.access_revoked_at else None,
            "last_accessed_at": (access.access_revoked_at or access.access_granted_at).isoformat() if (access.access_revoked_at or access.access_granted_at) else None,
            "is_active": access.is_active,
        }
        for access, patient in rows
    ]


@router.get("/doctors/{doctor_id}/trust")
def doctor_trust(doctor_id: int, _user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doctor = db.get(User, doctor_id)
    if not doctor or doctor.role != "doctor":
        raise HTTPException(status_code=404, detail="Doctor not found")
    return trust_score(db, doctor)


@router.get("/doctor/me/trust")
def my_trust(current_user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    return trust_score(db, current_user)


@router.get("/doctors/mine")
def my_doctors(current_user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Doctors this patient has had a consent session with: the only ones they may rate."""
    ids = {s.doctor_id for s in db.query(ActiveAccessSession.doctor_id).filter(ActiveAccessSession.patient_id == current_user.id)}
    out = []
    for doctor in db.query(User).filter(User.id.in_(ids)).all():
        mine = db.query(DoctorFeedback).filter(DoctorFeedback.doctor_id == doctor.id, DoctorFeedback.patient_id == current_user.id).first()
        out.append({"id": doctor.id, "name": doctor.display_name or f"Doctor {doctor.id}", "my_rating": mine.rating if mine else None,
                    "trust": trust_score(db, doctor)})
    return out


class FeedbackBody(BaseModel):
    rating: int
    comment: Optional[str] = None


@router.post("/doctors/{doctor_id}/feedback")
def rate_doctor(doctor_id: int, body: FeedbackBody, current_user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=422, detail="Rating must be 1-5")
    had_session = db.query(ActiveAccessSession).filter(ActiveAccessSession.doctor_id == doctor_id,
                                                       ActiveAccessSession.patient_id == current_user.id).first()
    if not had_session:
        raise HTTPException(status_code=403, detail="You can only rate doctors who have accessed your records")
    fb = db.query(DoctorFeedback).filter(DoctorFeedback.doctor_id == doctor_id, DoctorFeedback.patient_id == current_user.id).first() \
        or DoctorFeedback(doctor_id=doctor_id, patient_id=current_user.id, rating=body.rating)
    fb.rating, fb.comment = body.rating, (body.comment or "").strip()[:280] or None
    db.add(fb)
    db.commit()
    return trust_score(db, db.get(User, doctor_id))


class EndorseBody(BaseModel):
    hpr_id: str


@router.post("/doctors/endorse")
def endorse(body: EndorseBody, current_user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    """Community verification: a verified doctor vouches for a colleague by HPR ID."""
    colleague = db.query(User).filter(User.registry_id == body.hpr_id.strip().upper(), User.role == "doctor").first()
    if not colleague:
        raise HTTPException(status_code=404, detail="No registered doctor has that HPR ID")
    if colleague.id == current_user.id:
        raise HTTPException(status_code=422, detail="You can't endorse yourself")
    if not db.query(DoctorEndorsement).filter(DoctorEndorsement.doctor_id == colleague.id, DoctorEndorsement.endorsed_by == current_user.id).first():
        db.add(DoctorEndorsement(doctor_id=colleague.id, endorsed_by=current_user.id))
        db.commit()
    return {"endorsed": colleague.display_name or body.hpr_id, "trust": trust_score(db, colleague)}
