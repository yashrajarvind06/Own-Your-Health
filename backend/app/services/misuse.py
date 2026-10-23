"""Rule-based misuse detection (docx 'Misuse Alert System'): simple numeric rules over the audit log.

Every rule only creates an Alert for the patient; access itself is never blocked here.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ActiveAccessSession, Alert, AuditLog, User

IST = ZoneInfo("Asia/Kolkata")
MAX_PATIENTS_PER_HOUR = 10       # Rule 1
NIGHT_START, NIGHT_END = 0, 5     # Rule 2: 12 AM - 5 AM IST
MAX_DELEGATE_VIEWS_PER_DAY = 20   # Rule 4
DEDUP_WINDOW = timedelta(hours=1)  # one alert per rule/actor/patient per hour, so patients aren't flooded


def is_odd_hour(utc_now: datetime) -> bool:
    """utc_now is naive UTC, like every timestamp the app stores."""
    return NIGHT_START <= utc_now.replace(tzinfo=ZoneInfo("UTC")).astimezone(IST).hour < NIGHT_END


def _name(user: User) -> str:
    prefix = "Dr. " if user.role == "doctor" and not (user.display_name or "").startswith("Dr") else ""
    return prefix + (user.display_name or user.email)


def _raise(db: Session, patient_id: int, actor: User, rule: str, message: str, now: datetime) -> Alert | None:
    recent = db.query(Alert).filter(Alert.patient_id == patient_id, Alert.actor_user_id == actor.id,
                                    Alert.rule == rule, Alert.created_at > now - DEDUP_WINDOW).first()
    if recent:
        return None
    alert = Alert(patient_id=patient_id, actor_user_id=actor.id, rule=rule, message=message, created_at=now)
    db.add(alert)
    db.add(AuditLog(actor_user_id=actor.id, patient_id=patient_id, details=f"Event: MISUSE_ALERT, Rule: {rule}"))
    db.commit()
    return alert


def record_doctor_access(db: Session, doctor: User, patient_id: int, what: str, now: datetime | None = None) -> None:
    """Log a doctor looking at a patient's data, then run rules 1 and 2."""
    now = now or datetime.utcnow()
    db.add(AuditLog(actor_user_id=doctor.id, patient_id=patient_id, created_at=now,
                    details=f"Event: DOCTOR_ACCESS, What: {what}, Doctor: {doctor.id}"))
    db.commit()

    patients_last_hour = db.query(func.count(func.distinct(AuditLog.patient_id))).filter(
        AuditLog.actor_user_id == doctor.id,
        AuditLog.details.like("Event: DOCTOR_ACCESS%"),
        AuditLog.created_at > now - timedelta(hours=1),
    ).scalar()
    if patients_last_hour > MAX_PATIENTS_PER_HOUR:
        _raise(db, patient_id, doctor, "TOO_MANY_PATIENTS",
               f"Unusual access detected: {_name(doctor)} accessed {patients_last_hour} patient profiles in the last hour, including yours.", now)

    if is_odd_hour(now):
        local = now.replace(tzinfo=ZoneInfo("UTC")).astimezone(IST).strftime("%I:%M %p")
        _raise(db, patient_id, doctor, "ODD_HOURS",
               f"Unusual access detected: {_name(doctor)} opened your {what} at {local} (outside normal hours).", now)


def record_denied_doctor_access(db: Session, doctor: User, patient_id: int, what: str, now: datetime | None = None) -> None:
    """Rule 3: a doctor tries to reach the data after their consent expired or was revoked."""
    now = now or datetime.utcnow()
    had_consent = db.query(ActiveAccessSession).filter(
        ActiveAccessSession.doctor_id == doctor.id, ActiveAccessSession.patient_id == patient_id).first()
    if had_consent:
        _raise(db, patient_id, doctor, "NO_ACTIVE_CONSENT",
               f"Unusual access detected: {_name(doctor)} tried to open your {what} after their access had ended.", now)


def record_delegate_view(db: Session, delegate: User, patient_id: int, now: datetime | None = None) -> None:
    """Rule 4: a family member views the patient's records too often in one day."""
    now = now or datetime.utcnow()
    views_today = db.query(func.count(AuditLog.id)).filter(
        AuditLog.actor_user_id == delegate.id, AuditLog.patient_id == patient_id,
        AuditLog.details.like("Action: family_view%"), AuditLog.created_at > now - timedelta(days=1),
    ).scalar()
    if views_today > MAX_DELEGATE_VIEWS_PER_DAY:
        _raise(db, patient_id, delegate, "DELEGATE_OVERUSE",
               f"Unusual access detected: {delegate.display_name or 'A family member'} viewed your records {views_today} times in the last 24 hours.", now)
