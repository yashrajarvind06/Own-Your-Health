from sqlalchemy.orm import Session
from sqlalchemy import exists, and_, literal
from datetime import datetime, timedelta
from app.models import ReportAccess, ActiveAccessSession, AuditLog, MedicalReport, User, ReportAccessRequest
from app.services.audit_service import AuditService

class ReportAccessService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def grant_access(self, session_id: int, report_ids: list[int], duration: str, granted_by: int, expires_at: datetime = None):
        # Validate Session
        session = self.db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
        if not session or session.revoked_at:
            raise ValueError("Invalid or Revoked Session")

        if not expires_at:
            # Parse Duration
            duration_map = {
                "10m": timedelta(minutes=10),
                "1h": timedelta(hours=1),
                "1d": timedelta(days=1),
                "7d": timedelta(days=7)
            }
            delta = duration_map.get(duration, timedelta(hours=1))
            expires_at = datetime.utcnow() + delta

        created_accesses = []
        for rid in report_ids:
            # Check if report exists (optional but good)
            report = self.db.query(MedicalReport).filter(MedicalReport.id == rid).first()
            if not report: continue

            # Create Access
            access = ReportAccess(
                session_id=session_id,
                report_id=rid,
                granted_by=granted_by,
                expires_at=expires_at
            )
            
            existing = self.db.query(ReportAccess).filter(
                ReportAccess.session_id == session_id,
                ReportAccess.report_id == rid
            ).first()
            
            if existing:
                existing.expires_at = expires_at
                existing.revoked_at = None 
                created_accesses.append(existing)
            else:
                self.db.add(access)
                created_accesses.append(access)

        self.db.commit()

        # Audit
        self.audit_service.append_event(
            event_type="REPORT_ACCESS_GRANTED",
            actor_id=granted_by,
            actor_role="patient",
            patient_id=session.patient_id,
            doctor_id=session.doctor_id,
            report_id="MULTIPLE",
            access_mode="normal",
            reason=f"Granted {len(created_accesses)} reports until {expires_at}"
        )
        return created_accesses

    def can_view_report(self, session_id: int, report_id: int) -> bool:
        """
        Optimized Check:
        1. Access Record exists
        2. SessionID matches
        3. ReportID matches
        4. Not Revoked
        5. Not Expired
        6. Parent Session Not Revoked (Added)
        """
        now = datetime.utcnow()
        record = self.db.query(ReportAccess).join(ActiveAccessSession).filter(
            ReportAccess.session_id == session_id,
            ReportAccess.report_id == report_id,
            ReportAccess.revoked_at.is_(None),
            ReportAccess.expires_at > now,
            ActiveAccessSession.revoked_at.is_(None) 
        ).first()
        return record is not None

    def get_accessible_reports(self, session_id: int):
        now = datetime.utcnow()
        access_records = self.db.query(ReportAccess).join(ActiveAccessSession).filter(
            ReportAccess.session_id == session_id,
            ReportAccess.revoked_at.is_(None),
            ReportAccess.expires_at > now,
            ActiveAccessSession.revoked_at.is_(None) 
        ).all()
        
        # Enrich with Access Type Strategy
        enriched = []
        for r in access_records:
            access_type = "STANDARD"
            
            # Check if this access is backed by an APPROVED request (thus Temporary)
            req = self.db.query(ReportAccessRequest).filter(
                ReportAccessRequest.session_id == session_id,
                ReportAccessRequest.report_id == r.report_id,
                ReportAccessRequest.status == "APPROVED"
            ).first()
            
            if req:
                access_type = "TEMPORARY"

            enriched.append({
                "report_id": r.report_id,
                "expires_at": r.expires_at,
                "access_type": access_type
            })
            
        return enriched

    def get_revoked_reports(self, session_id: int):
        return self.db.query(ReportAccess).filter(
            ReportAccess.session_id == session_id,
            ReportAccess.revoked_at.isnot(None)
        ).all()

    def revoke_report_access(self, session_id: int, report_id: int, revoked_by: int):
        now = datetime.utcnow()
        access = self.db.query(ReportAccess).filter(
            ReportAccess.session_id == session_id,
            ReportAccess.report_id == report_id,
            ReportAccess.revoked_at.is_(None)
        ).first()

        if not access:
            return False

        access.revoked_at = now
        self.db.commit()

        # Audit
        session = self.db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
        doctor_id = session.doctor_id if session else 0

        self.audit_service.append_event(
            event_type="REPORT_ACCESS_REVOKED",
            actor_id=revoked_by,
            actor_role="patient",
            patient_id=revoked_by, 
            doctor_id=doctor_id,
            report_id=str(report_id),
            access_mode="normal",
            reason="Patient revoked specific report access"
        )
        return True

    # --- Phase 6: Request Flow ---
    
    def request_report_access(self, session_id: int, report_id: int, doctor_id: int, reason: str):
        # 1. Validation
        session = self.db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
        if not session or session.doctor_id != doctor_id:
            raise ValueError("Invalid Session")
        
        # 2. Check overlap
        if self.can_view_report(session_id, report_id):
            raise ValueError("Access already granted")

        # Is there a pending request?
        pending = self.db.query(ReportAccessRequest).filter(
            ReportAccessRequest.session_id == session_id,
            ReportAccessRequest.report_id == report_id,
            ReportAccessRequest.status == "PENDING"
        ).first()
        if pending:
             raise ValueError("Request already pending")

        # Check if previously approved (One-time Access Rule)
        prior_approved = self.db.query(ReportAccessRequest).filter(
            ReportAccessRequest.session_id == session_id,
            ReportAccessRequest.report_id == report_id,
            ReportAccessRequest.status == "APPROVED"
        ).first()
        if prior_approved:
            raise ValueError("Access limit reached for this session")

        # 3. Create Request
        req = ReportAccessRequest(
            session_id=session_id,
            report_id=report_id,
            doctor_id=doctor_id,
            status="PENDING",
            reason=reason or "Professional Request"
        )
        self.db.add(req)
        self.db.commit()
        return req

    def get_session_requests(self, session_id: int):
        return self.db.query(ReportAccessRequest).filter(
            ReportAccessRequest.session_id == session_id
        ).all()

    def get_pending_requests(self, patient_id: int):
        results = self.db.query(
            ReportAccessRequest, 
            User.display_name.label("doctor_name"),
            MedicalReport.filename.label("report_name")
        ).join(
            ActiveAccessSession, ReportAccessRequest.session_id == ActiveAccessSession.id
        ).join(
            User, ReportAccessRequest.doctor_id == User.id
        ).join(
            MedicalReport, ReportAccessRequest.report_id == MedicalReport.id
        ).filter(
            ActiveAccessSession.patient_id == patient_id,
            ReportAccessRequest.status == "PENDING",
            ActiveAccessSession.revoked_at.is_(None), 
            ActiveAccessSession.expires_at > datetime.utcnow()
        ).order_by(ReportAccessRequest.created_at.desc()).all()

        return [
            {
                "id": r.ReportAccessRequest.id,
                "doctor_name": r.doctor_name or f"Doctor {r.ReportAccessRequest.doctor_id}",
                "report_name": r.report_name,
                "reason": r.ReportAccessRequest.reason,
                "created_at": r.ReportAccessRequest.created_at
            }
            for r in results
        ]

    def respond_to_request(self, request_id: int, decision: str, user_id: int):
        req = self.db.query(ReportAccessRequest).filter(ReportAccessRequest.id == request_id).first()
        if not req:
            raise ValueError("Request not found")
        
        # Verify ownership (via session->patient_id)
        session = self.db.query(ActiveAccessSession).filter(ActiveAccessSession.id == req.session_id).first()
        if not session or session.patient_id != user_id:
             raise ValueError("Unauthorized")

        if req.status != "PENDING":
             raise ValueError("Request is not pending")

        req.status = decision # APPROVED | DENIED
        req.resolved_at = datetime.utcnow()
        
        if decision == "APPROVED":
            # Grant 10 mins (Fixed for now)
            expires = datetime.utcnow() + timedelta(minutes=10)
            self.grant_access(
                session_id=req.session_id,
                report_ids=[req.report_id], 
                granted_by=user_id,
                duration="10m",
                expires_at=expires
            )
            
            # Log
            self.audit_service.append_event(
                event_type="REPORT_ACCESS_APPROVED",
                actor_id=user_id,
                actor_role="patient",
                patient_id=user_id,
                doctor_id=req.doctor_id,
                report_id=str(req.report_id),
                access_mode="normal",
                access_reason=f"Approved Request: {req.reason}"
            )
        else:
             # Log Denial
             self.audit_service.append_event(
                event_type="REPORT_ACCESS_DENIED",
                actor_id=user_id,
                actor_role="patient",
                patient_id=user_id,
                doctor_id=req.doctor_id,
                report_id=str(req.report_id),
                access_mode="normal",
                access_reason=f"Denied Request"
            )

        self.db.commit()
        return {"status": decision}
