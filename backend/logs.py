from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AuditLog
from ..services.log_service import LogService

router = APIRouter()

@router.get("/patient/logs")
def get_patient_logs(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    log_service = LogService(db)
    logs = log_service.get_patient_logs(patient_id=user.id)
    
    results = []
    for log in logs:
        results.append({
            "id": log.id,
            "event_type": log.event_type,
            "actor_id": log.actor_id,
            "actor_role": log.actor_role,
            "patient_id": log.patient_id,
            "doctor_id": log.doctor_id,
            "report_id": log.report_id,
            "access_mode": log.access_mode,
            "metadata": log.metadata,
            "timestamp_utc": log.timestamp_utc.isoformat()
        })
    return results

@router.get("/doctor/logs")
def get_doctor_logs(user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    log_service = LogService(db)
    logs = log_service.get_doctor_logs(doctor_id=user.id)
    
    results = []
    for log in logs:
        results.append({
            "id": log.id,
            "event_type": log.event_type,
            "actor_id": log.actor_id,
            "actor_role": log.actor_role,
            "patient_id": log.patient_id,
            "doctor_id": log.doctor_id,
            "report_id": log.report_id,
            "access_mode": log.access_mode,
            "metadata": log.metadata,
            "timestamp_utc": log.timestamp_utc.isoformat()
        })
    return results
