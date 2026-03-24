from fastapi import APIRouter, Depends, HTTPException, Body, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models import AccessRequest, ActiveAccessSession, User
from app.services.access_service import AccessService
from app.deps import get_db, require_role
from app.auth import get_current_user
from pydantic import BaseModel

router = APIRouter()

class RequestAccessModel(BaseModel):
    token: str
    patient_id: int
    report_id: str = "ALL"
    doctor_id: int = None
    access_context: str = "NORMAL"
    access_reason: str = None
    reason_note: str = None

@router.post("/request")
def request_access_legacy(request: Request):
    # TRAP for Old Frontend
    raise HTTPException(
        status_code=400, 
        detail="CRITICAL: Stale Frontend Detected. You are calling the OLD API. Please Hard Refresh (Ctrl+F5) immediately."
    )

@router.post("/request-v2")
def request_access(
    request: Request,
    request_data: RequestAccessModel = Body(None),
    user: User = Depends(require_role("doctor")), 
    db: Session = Depends(get_db)
):
    # Detect Stale Frontend (Query Params instead of Body)
    if request_data is None:
        if "token" in request.query_params:
            raise HTTPException(
                status_code=400, 
                detail="CRITICAL: Your Frontend is outdated. Please Hard Refresh (Ctrl+F5) to load the new Access Reason feature."
            )
        raise HTTPException(status_code=422, detail="Request Body is missing.")

    if request_data.doctor_id is None:
        request_data.doctor_id = user.id
    access_service = AccessService(db)
    try:
        access_request = access_service.request_access(
            request_data.doctor_id, 
            request_data.patient_id, 
            request_data.report_id, 
            request_data.token, 
            request_data.access_context, 
            request_data.access_reason, 
            request_data.reason_note
        )
        return {"message": "Access request submitted", "request_id": access_request.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/requests/pending")
def list_pending_requests(patient_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    access_service = AccessService(db)
    pending_requests = access_service.get_pending_requests(patient_id)
    return [{"id": req.id, "doctor_id": req.doctor_id, "doctor_name": req.doctor.display_name, "patient_id": req.patient_id} for req in pending_requests]

class ApproveRequestModel(BaseModel):
    request_id: int
    duration: str = "15m" # Default 15 minutes

@router.post("/approve")
def approve_request(
    body: ApproveRequestModel, 
    user: User = Depends(require_role("patient")), 
    db: Session = Depends(get_db)
):
    print(f"DEBUG: Endpoint /access/approve hit with body: {body}")
    access_service = AccessService(db)
    try:
        active_session = access_service.approve_request(body.request_id, body.duration)
        return {"message": "Access request approved", "session_id": active_session.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

from app.enums import AccessDenyReason, DecisionActor
from pydantic import BaseModel

class DenyRequestModel(BaseModel):
    reason: AccessDenyReason = AccessDenyReason.PATIENT_REJECTED
    decision_by: DecisionActor = DecisionActor.PATIENT

@router.post("/deny")
def deny_request(request_id: int, body: DenyRequestModel = DenyRequestModel(), user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    access_service = AccessService(db)
    result = access_service.deny_request(request_id, reason=body.reason, decision_by=body.decision_by)
    return result

@router.get("/session/status")
def session_status(patient_id: int, doctor_id: int = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access_service = AccessService(db)
    
    # Infer Doctor ID from User if not provided
    if doctor_id is None:
        if user.role == "doctor":
            doctor_id = user.id
        else:
            raise HTTPException(status_code=400, detail="Doctor ID is required for non-doctor users.")

    # New Production-Grade Logic
    state = access_service.get_smart_status(doctor_id, patient_id)
    
    sess = state["session"]
    # Ensure backward compatibility by keeping all fields
    return [{
        "id": sess.id if sess else 0,
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "expires_at": sess.expires_at.isoformat() if sess else None,
        "remaining_seconds": state["remaining_seconds"],
        "status": state["status"] # New derived field
    }]

@router.get("/session/list")
def list_doctor_sessions(doctor_id: int, user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    access_service = AccessService(db)
    sessions = access_service.get_all_doctor_sessions(doctor_id)
    return [
        {
            "id": sess.id,
            "doctor_id": sess.doctor_id,
            "patient_id": sess.patient_id,
            "expires_at": sess.expires_at.isoformat(),
            "remaining_seconds": int((sess.expires_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).total_seconds())
        }
        for sess in sessions
    ]

class RevokeSessionModel(BaseModel):
    patient_id: int = None # Optional if Patient is revoking (inferred self) but we keep it for consistency or Doctor use
    doctor_id: int = None # Required if Patient is revoking
    reason: str = "Session Ended"

@router.post("/revoke")
def revoke_session(
    body: RevokeSessionModel, 
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Revokes an active session. 
    - Doctor can revoke their own session with a patient.
    - Patient can revoke a doctor's access (doctor_id required).
    """
    from app.enums import RevocationSource
    
    access_service = AccessService(db)
    
    source = RevocationSource.SYSTEM
    doctor_id = None
    patient_id = None
    
    if user.role == "doctor":
        source = RevocationSource.DOCTOR
        doctor_id = user.id
        patient_id = body.patient_id
        if not patient_id:
             raise HTTPException(status_code=422, detail="Doctors must provide patient_id to revoke.")

    elif user.role == "patient":
        source = RevocationSource.PATIENT
        patient_id = user.id
        doctor_id = body.doctor_id
        if not doctor_id:
             raise HTTPException(status_code=422, detail="Patients must provide doctor_id to revoke access.")
    
    result = access_service.revoke_session(
        doctor_id=doctor_id, 
        patient_id=patient_id, 
        revoked_by=user.id, 
        revocation_source=source, 
        revocation_reason=body.reason
    )
    
    if not result:
            # Idempotency: check if it was emergency (cannot revoke) or just not found
            # For now, just 404
            raise HTTPException(status_code=404, detail="No active revocable session found.")
            
    return {"status": "revoked"} 

@router.get("/sessions/active")
def get_active_sessions_for_doctor(user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    """
    Returns currently active sessions for the logged-in doctor.
    Used for 'Access Granted' dashboard visibility.
    """
    access_service = AccessService(db)
    sessions = access_service.get_doctor_active_sessions(user.id)
    return sessions

@router.get("/patient/active")
def get_active_sessions_for_patient(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """
    Returns list of doctors who have active access to the patient's data.
    """
    access_service = AccessService(db)
    return access_service.get_patient_active_sessions(user.id)
