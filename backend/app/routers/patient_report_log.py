from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import List, Optional
from datetime import datetime, timezone

from ..database import get_db
from ..models import User, ActiveAccessSession, ReportAccess, MedicalReport, AuditLog
from ..auth import get_current_user

router = APIRouter()

@router.get("/access-log")
def get_report_access_log(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "patient":
        return []

    # 1. Fetch Report Grants (ReportAccess) joined with Session, Report, Doctor
    # This gives us the "Potential" access (Privacy rules)
    query = (
        db.query(ReportAccess, ActiveAccessSession, MedicalReport, User)
        .join(ActiveAccessSession, ReportAccess.session_id == ActiveAccessSession.id)
        .join(MedicalReport, ReportAccess.report_id == MedicalReport.id)
        .join(User, ActiveAccessSession.doctor_id == User.id)
        .filter(ActiveAccessSession.patient_id == current_user.id)
        .order_by(desc(ReportAccess.granted_at))
        .limit(limit)
        .offset(offset)
    )
    
    results = query.all()
    
    logs = []
    now = datetime.now(timezone.utc).replace(tzinfo=None) # naive comparison if db is naive

    # 2. Heuristic: Fetch recent 'VIEW_REPORT' audit logs for this patient to correlate "Viewed" status
    # This is an optimization. For strict accuracy we might query per session, but fetching batch is better.
    # We'll fetch last N audit logs.
    audit_logs = db.query(AuditLog).filter(
        AuditLog.patient_id == current_user.id,
        or_(AuditLog.details.like("%VIEWED_REPORT%"), AuditLog.details.like("%VIEW_REPORTS%"))
    ).order_by(desc(AuditLog.created_at)).limit(100).all()

    # Pre-process audit logs keys to match: session_id? or just fuzzy match time and actor?
    # Since AuditLog might not have session_id stored in all rows (check models), 
    # we'll use Actor + Time + Report Name heuristic if needed. 
    # Actually, if we look at `reports.py` (viewed earlier), does it log session_id?
    # If not, strictly linking "Viewed" to a specific `ReportAccess` row is hard.
    # We will assume "GRANTED" is the primary state, and check if *any* view happened for that file by that doctor.

    for ra, session, report, doctor in results:
        # Determine Status
        status = "GRANTED"
        status_label = "Access granted"
        
        # Check Expiry
        is_expired = False
        if ra.expires_at and ra.expires_at < datetime.utcnow():
            is_expired = True
            status = "EXPIRED"
            status_label = "Access expired"
            
        if ra.revoked_at:
            status = "REVOKED"
            status_label = "Access revoked"
            
        # Check Viewing Activity (Heuristic)
        # Verify if this doctor viewed this report around this session time
        # We look for an audit log by this doctor, creating "VIEWED_REPORT", containing report filename/ID
        viewed_at = None
        for log in audit_logs:
            if log.actor_user_id == doctor.id:
                 # Check content match
                 if report.filename in (log.details or "") or report.report_id in (log.details or ""):
                     # Check time: Log created_at must be >= session.created_at
                     if log.created_at >= session.created_at:
                         status = "VIEWED"
                         status_label = "Report viewed"
                         viewed_at = log.created_at
                         break
        
        logs.append({
            "report_name": report.filename, # User friendly name
            "accessed_by": doctor.display_name or f"Doctor #{doctor.id}",
            "access_type": "CONSENT",
            "session_id": session.id,
            "granted_at": ra.granted_at,
            "accessed_at": viewed_at if viewed_at else ra.granted_at, # Default to grant time if not viewed
            "expires_at": ra.expires_at,
            "status": status,
            "status_label": status_label,
            "is_active": not is_expired and not ra.revoked_at
        })
        

    # Re-sort combined list by time
    logs.sort(key=lambda x: x["granted_at"], reverse=True)

    return logs
