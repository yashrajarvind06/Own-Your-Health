from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, aliased
from sqlalchemy import desc, or_, and_, exists
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from ..database import get_db
from ..models import User, ActiveAccessSession, AuditLog, ReportAccess, MedicalReport, ReportAccessRequest
from ..auth import get_current_user, get_active_profile_user_id

router = APIRouter()

class AccessedReport(BaseModel):
    report_id: int
    report_name: str
    accessed: bool # True if unlocked/granted
    access_type: Optional[str] = "STANDARD"

class HistoryEntry(BaseModel):
    session_id: int # ID or Emergency ID
    doctor_name: str
    access_type: str # NORMAL | EMERGENCY
    reason: str
    start_time: datetime
    end_time: datetime # Expires at
    status: str # ACTIVE | EXPIRED | REVOKED
    reports: List[AccessedReport]

@router.get("/history", response_model=List[HistoryEntry])
def get_access_history(
    limit: int = 50,
    offset: int = 0,
    include_expired: bool = True,
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Returns a unified history of both Normal and Emergency access sessions.
    """
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view access history.")
    patient_id = get_active_profile_user_id(user)
    
    history_items = []
    now = datetime.utcnow()

    # 1. NORMAL SESSIONS (Active + Revoked + Expired)
    # ------------------------------------------------
    query = db.query(ActiveAccessSession).filter(ActiveAccessSession.patient_id == patient_id)
    if not include_expired:
         query = query.filter(ActiveAccessSession.expires_at > now)
    
    # Sort DESC
    normal_sessions = query.order_by(desc(ActiveAccessSession.created_at)).limit(limit).offset(offset).all()

    for s in normal_sessions:
        # Determine Status
        status = "ACTIVE"
        if s.revoked_at:
            status = "REVOKED"
        elif s.expires_at < now:
            status = "EXPIRED"

        # Fetch Doctor Name
        doc = db.query(User).filter(User.id == s.doctor_id).first()
        doc_name = doc.display_name if doc else f"Doctor {s.doctor_id}"

        # Fetch Reports
        # Join ReportAccess with MedicalReport to get names
        # FIX: Filter out revoked reports so they don't show as Active shares
        granted_reports = db.query(ReportAccess, MedicalReport).\
            join(MedicalReport, ReportAccess.report_id == MedicalReport.id).\
            filter(
                ReportAccess.session_id == s.id,
                ReportAccess.revoked_at.is_(None) # Helper method/property? No, standard SQLAlchemy
            ).all()
        
        reports_list = []
        for ra, mr in granted_reports:
             # Check for APPROVED Request matching this access
             req = db.query(ReportAccessRequest).filter(
                 ReportAccessRequest.session_id == s.id,
                 ReportAccessRequest.report_id == mr.id,
                 ReportAccessRequest.status == "APPROVED"
             ).order_by(ReportAccessRequest.resolved_at.desc()).first()
             
             atype = "STANDARD"
             if req:
                # Check if this request is relevant to the CURRENT access record
                # If the access grant is significantly newer than the request resolution, 
                # it's likely a manual re-grant (STANDARD).
                is_stale = False
                if ra.granted_at and req.resolved_at:
                    diff = (ra.granted_at - req.resolved_at).total_seconds()
                    if diff > 60: # 1 minute buffer
                        is_stale = True
                
                if not is_stale:
                    atype = "TEMPORARY"

             reports_list.append({
                 "report_id": mr.id,
                 "report_name": mr.filename,
                 "accessed": True,
                 "access_type": atype
             })

        # Fetch Reason from Audit Log (Heuristic)
        # Look for ACCESS_APPROVED event around created_at
        audit = db.query(AuditLog).filter(
            AuditLog.patient_id == patient_id,
            AuditLog.actor_user_id == user.id, # Patient approves
            AuditLog.details.like("%Event: ACCESS_APPROVED%"),
            AuditLog.details.like(f"%Doctor: {s.doctor_id}%")
        ).order_by(desc(AuditLog.created_at)).first()

        reason = "General Consent"
        if audit and audit.details:
             # Parse 'Reason: ...'
             parts = audit.details.split(", ")
             for p in parts:
                 if p.startswith("Reason:"):
                     reason = p.replace("Reason:", "").strip()
        
        history_items.append({
            "session_id": s.id,
            "doctor_name": doc_name,
            "access_type": "NORMAL",
            "reason": reason,
            "start_time": s.created_at,
            "end_time": s.expires_at,
            "status": status,
            "reports": reports_list
        })


    # Sort Combined List
    history_items.sort(key=lambda x: x["start_time"], reverse=True)
    
    # Paginate Combined? 
    # Since we fetched limit from both, the combined list might be 2x limit.
    # Simple slice for now.
    return history_items[:limit]
