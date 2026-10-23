"""Doctor trust score (docx 'To work on'): registry verification + hospital affiliation + patient feedback + community verification."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DoctorEndorsement, DoctorFeedback, User
from app.services.registry import lookup

# Max points per signal; total 100
REGISTRY, AFFILIATION, FEEDBACK, COMMUNITY = 40, 20, 30, 10
POINTS_PER_ENDORSEMENT = 2


def trust_score(db: Session, doctor: User) -> dict:
    profile = lookup("doctor", doctor.registry_id) if doctor.verified_at else None
    avg, count = db.query(func.avg(DoctorFeedback.rating), func.count(DoctorFeedback.id)) \
        .filter(DoctorFeedback.doctor_id == doctor.id).one()
    endorsements = db.query(func.count(DoctorEndorsement.id)).filter(DoctorEndorsement.doctor_id == doctor.id).scalar()
    parts = {
        "registry": REGISTRY if profile else 0,
        "affiliation": AFFILIATION if profile and profile.get("hospital") else 0,
        "feedback": round(float(avg) / 5 * FEEDBACK) if count else 0,
        "community": min(endorsements * POINTS_PER_ENDORSEMENT, COMMUNITY),
    }
    return {
        "score": sum(parts.values()),
        "breakdown": parts,
        "rating_avg": round(float(avg), 1) if count else None,
        "rating_count": count,
        "endorsements": endorsements,
        "hospital": profile.get("hospital") if profile else None,
    }
