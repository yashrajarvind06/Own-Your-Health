from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User, ActiveAccessSession
from ..services.report_access_service import ReportAccessService
from ..deps import require_role
from pydantic import BaseModel

router = APIRouter()

class GrantReportAccessModel(BaseModel):
    session_id: int
    report_ids: List[int]
    duration: str = "1h"

class RevokeReportAccessModel(BaseModel):
    session_id: int
    report_id: int

@router.post("/grant")
def grant_report_access(
    body: GrantReportAccessModel,
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    # Verify session belongs to patient
    session = db.query(ActiveAccessSession).filter(ActiveAccessSession.id == body.session_id).first()
    if not session or session.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Invalid session")

    service.grant_access(body.session_id, body.report_ids, body.duration, user.id)
    return {"status": "granted"}

@router.get("/active")
def get_active_report_access(
    session_id: int,
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    # Verify doctor owns session
    session = db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
    if not session or session.doctor_id != user.id:
         raise HTTPException(status_code=403, detail="Invalid session")

    # Service now returns dicts with access_type
    access_records = service.get_accessible_reports(session_id)
    return access_records

@router.get("/revoked")
def get_revoked_report_access(
    session_id: int,
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    # Verify doctor owns session
    session = db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
    if not session or session.doctor_id != user.id:
         raise HTTPException(status_code=403, detail="Invalid session")

    revoked = service.get_revoked_reports(session_id)
    return [{"report_id": r.report_id} for r in revoked]

@router.post("/revoke")
def revoke_report_access(
    body: RevokeReportAccessModel,
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    
    # Verify session ownership
    session = db.query(ActiveAccessSession).filter(ActiveAccessSession.id == body.session_id).first()
    if not session or session.patient_id != user.id:
         raise HTTPException(status_code=403, detail="Invalid session ownership")

    success = service.revoke_report_access(body.session_id, body.report_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Access not found or already revoked")
    
    return {"status": "revoked"}

class RequestReportAccessModel(BaseModel):
    session_id: int
    report_id: int
    reason: str

@router.post("/request")
def request_report_access(
    body: RequestReportAccessModel,
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    # Service validates session ownership via doctor_id param
    try:
        service.request_report_access(body.session_id, body.report_id, user.id, body.reason)
        return {"status": "requested"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/requests")
def get_report_requests(
    session_id: int,
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    service = ReportAccessService(db)
    # Validate Doctor owns this session
    session = db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
    if not session or session.doctor_id != user.id:
         raise HTTPException(status_code=403, detail="Invalid session")

    requests = service.get_session_requests(session_id)
    return [{
        "report_id": r.report_id,
        "status": r.status,
        "created_at": r.created_at
    } for r in requests]


# --- PATIENT FLOW ---

class RespondToRequestModel(BaseModel):
    request_id: int
    decision: str # APPROVED | DENIED

@router.get("/patient/pending")
def get_patient_pending_requests(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    """
    Get all PENDING requests for the current patient.
    """
    service = ReportAccessService(db)
    return service.get_pending_requests(patient_id=user.id)

@router.post("/patient/respond")
def respond_to_request(
    body: RespondToRequestModel,
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    """
    Patient approves or denies a request.
    """
    service = ReportAccessService(db)
    try:
        res = service.respond_to_request(
            request_id=body.request_id,
            decision=body.decision.upper(),
            user_id=user.id
        )
        return res
    except ValueError as e:
         raise HTTPException(status_code=400, detail=str(e))
