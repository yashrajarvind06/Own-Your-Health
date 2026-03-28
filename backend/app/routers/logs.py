from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from ..models import AuditLog
from app.models import User
from app.auth import get_active_profile_user_id
from ..services.log_service import LogService

router = APIRouter()


@router.get("/patient/logs")
def get_patient_logs(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db),
):
    log_service = LogService(db)
    logs = log_service.get_patient_logs(patient_id=get_active_profile_user_id(user))
    return [_map_log(log, db) for log in logs]


@router.get("/doctor/logs")
def get_doctor_logs(
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    log_service = LogService(db)
    print(f"DEBUG: Fetching logs for Doctor ID: {user.id}")
    logs = log_service.get_doctor_logs(doctor_id=user.id)
    print(f"DEBUG: Found {len(logs)} logs for Doctor {user.id}")
    return [_map_log(log, db) for log in logs]


def _map_log(log: AuditLog, db: Session = None) -> dict:
    try:
        # 1. Parse Details Safely
        data = {}
        if log.details:
            try:
                parts = log.details.split(", ")
                for part in parts:
                    if ": " in part:
                        k, v = part.split(": ", 1)
                        data[k] = v.strip()
            except:
                pass # Fail safe parsing

        # 2. Determine Event/Action
        event = data.get("Event", "UNKNOWN")
        if event == "UNKNOWN" and "Action" in data:
            event = data["Action"]
        action = event.replace("ACCESS_", "") if event.startswith("ACCESS_") else event

        # 3. Determine Roles and IDs
        role = str(data.get("Role", "unknown")).lower()
        is_doctor_action = (role == "doctor")
        
        # Doctor ID
        doctor_id = None
        if "Doctor" in data and str(data["Doctor"]).isdigit():
            doctor_id = int(data["Doctor"])
        elif is_doctor_action:
            doctor_id = log.actor_user_id

        # Doctor Name Resolution
        doctor_name_str = "System"
        
        # Strategy A: It's the actor (Doctor actions)
        if is_doctor_action:
            if log.actor_user and log.actor_user.display_name:
                doctor_name_str = log.actor_user.display_name
            else:
                 # Fallback to ID
                 doctor_name_str = f"Doctor #{log.actor_user_id}"
        
        # Strategy B: Valid Doctor ID present (e.g. Approval event)
        elif doctor_id:
             # Try to lookup name from DB if available
             if db:
                 try:
                     doc_user = db.query(User).filter(User.id == doctor_id).first()
                     if doc_user and doc_user.display_name:
                         doctor_name_str = doc_user.display_name
                     else:
                         doctor_name_str = f"Doctor #{doctor_id}"
                 except:
                     doctor_name_str = f"Doctor #{doctor_id}"
             else:
                 doctor_name_str = f"Doctor #{doctor_id}"

        # Actor Name
        actor_name_str = f"User #{log.actor_user_id}"
        if log.actor_user and log.actor_user.display_name:
            actor_name_str = log.actor_user.display_name
        
        return {
            "id": log.id,
            "action": action,
            "event_type": event,
            "actor_id": log.actor_user_id,
            "actor_role": data.get("Role", "unknown"),
            "actor_name": actor_name_str,
            "patient_id": log.patient_id,
            "patient_name": log.patient.display_name if log.patient and log.patient.display_name else f"Patient #{log.patient_id}" if log.patient_id else "Unknown",
            "doctor_id": doctor_id,
            "doctor_name": doctor_name_str,
            "report_id": data.get("Report"),
            "access_mode": data.get("Access", "NORMAL").upper(),
            "access_context": data.get("Context", "NORMAL").upper(),
            "metadata": log.details,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "reason": data.get("Reason"), # Denial Reason
            "access_reason": data.get("ReasonCode"), # Access Reason (Phase 2)
            "decision_by": data.get("DecisionBy"),
        }
    except Exception as e:
        # Fallback to ensure UI receives SOMETHING rather than crashing or empty list
        print(f"Error parsing log {log.id}: {e}")
        return {
            "id": log.id,
            "action": "ERROR",
            "event_type": "ERROR",
            "actor_id": log.actor_user_id,
            "actor_role": "error",
            "actor_name": "Error",
            "patient_id": log.patient_id,
            "patient_name": "Error",
            "doctor_id": None,
            "doctor_name": "Error",
            "access_mode": "NORMAL",
            "timestamp": log.created_at.isoformat() if log.created_at else None, 
        }
