from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models import User
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
