from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.models import User
from app.services.emergency_service import EmergencyService
from app.deps import get_db, require_role

from app.schemas import EmergencyProfileCreate, EmergencyProfileUpdate, EmergencyProfileResponse
from app.services.log_service import LogService

router = APIRouter()

@router.get("/profile/me", response_model=EmergencyProfileResponse)
def get_my_emergency_profile(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    emergency_service = EmergencyService(db)
    profile = emergency_service.get_profile_for_patient(user.id)
    if not profile:
        # Prevent 500, return 404/200-empty? Spec says "If none -> empty form". 
        # But backend spec for *Doctor* said 404. 
        # For patient, usually 404 or empty. Let's return 404 or just return none if schema allows.
        # Actually for a GET /me, checking if it exists is common. 
        # But frontend wants to load form. 
        # Let's return 404 with specific detail if missing, generic error otherwise.
        # Actually wait, UX Rules: "If none -> empty form". Frontend usually handles 404 or 204.
        # Impl: raise HTTPException(404, detailed="Not set") to indicate empty state.
        raise HTTPException(status_code=404, detail="Emergency profile not set")
    return profile

@router.post("/profile", response_model=EmergencyProfileResponse)
def create_emergency_profile(body: EmergencyProfileCreate, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    emergency_service = EmergencyService(db)
    return emergency_service.create_or_update_profile(user.id, body.model_dump())

@router.put("/profile", response_model=EmergencyProfileResponse)
def update_emergency_profile(body: EmergencyProfileUpdate, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    emergency_service = EmergencyService(db)
    # Using model_dump(exclude_unset=True) to allow partial updates if needed, 
    # though create_or_update handles full replace if we pass all fields. 
    return emergency_service.create_or_update_profile(user.id, body.model_dump(exclude_unset=True))


@router.post("/override")
def emergency_override(
    body: dict, # { "patient_id": int }
    doctor: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    from app.models import EmergencyAccess
    from datetime import datetime, timedelta
    from app.services.audit_service import AuditService

    patient_id = body.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="Patient ID required")

    # Check for Prior Denial (last 15 mins)
    from app.models import AuditLog
    now = datetime.utcnow()
    denial_log = db.query(AuditLog).filter(
        AuditLog.created_at >= now - timedelta(minutes=15),
        AuditLog.patient_id == patient_id,
        AuditLog.details.like("%Event: ACCESS_DENIED%"),
        AuditLog.details.like(f"%Doctor: {doctor.id}%")
    ).order_by(AuditLog.created_at.desc()).first()

    event_type = "EMERGENCY_OVERRIDE"
    reason_detail = None
    
    if denial_log:
        event_type = "EMERGENCY_OVERRIDE_AFTER_DENIAL"
        reason_detail = "PreviousState: DENIED"

    # Create Non-Session Emergency Context
    access = EmergencyAccess(
        doctor_id=doctor.id,
        patient_id=patient_id,
        expires_at=datetime.utcnow() + timedelta(minutes=30)
    )
    db.add(access)
    db.commit()

    # Log Intent
    audit_service = AuditService(db)
    audit_service.append_event(
        event_type=event_type,
        actor_id=doctor.id,
        actor_role="doctor",
        patient_id=patient_id,
        doctor_id=doctor.id,
        report_id=None,
        access_mode="EMERGENCY",
        access_context="EMERGENCY_CONTEXT",
        reason=reason_detail
    )
    
    return {"status": "active", "expires_in": 300}

@router.get("/profile")
def get_emergency_profile(
    patient_id: int, 
    doctor: User = Depends(require_role("doctor")), 
    db: Session = Depends(get_db),
    intent: str = Header(None, alias="X-Access-Intent")
):
    # DEFENSIVE GUARD: Explicit Intent Required
    if not intent or intent != "EMERGENCY_VIEW":
        raise HTTPException(status_code=400, detail="Explicit intent header required for emergency access.")

    from app.models import ActiveAccessSession, EmergencyAccess
    from datetime import datetime
    now = datetime.utcnow()

    # 1. Check Emergency Override Context (Non-Session)
    override = db.query(EmergencyAccess).filter(
        EmergencyAccess.doctor_id == doctor.id,
        EmergencyAccess.patient_id == patient_id,
        EmergencyAccess.expires_at > now
    ).first()

    # 2. Check Normal Consent Session
    session = db.query(ActiveAccessSession).filter(
        ActiveAccessSession.doctor_id == doctor.id,
        ActiveAccessSession.patient_id == patient_id,
        ActiveAccessSession.expires_at > now
    ).first()

    mode = None
    if override:
        mode = "EMERGENCY"
    elif session:
        mode = "NORMAL"
    else:
        # Allow Access-Free Emergency View (as requested)
        # This is "Safe View" - no privilege escalation, just info.
        mode = "NORMAL"

    emergency_service = EmergencyService(db)
    try:
        profile = emergency_service.get_emergency_profile(doctor.id, patient_id)
        
        # Log Access
        log_service = LogService(db)
        log_service.log_accessible_action(
            actor_user_id=doctor.id,
            patient_id=patient_id,
            event_type="VIEW_EMERGENCY_PROFILE",
            access_mode=mode,
            access_context="EMERGENCY_CONTEXT"
        )

        return profile
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
