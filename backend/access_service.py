from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models import AccessRequest, ActiveAccessSession, MedicalReport
from app.routers.reports import presigned
from app.services.audit_service import AuditService  # Import AuditService

ACCESS_SESSION_DURATION = timedelta(minutes=10)

class AccessService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)  # Initialize AuditService

    def request_access(self, doctor_id: int, patient_id: int, report_id: str):
        access_request = AccessRequest(doctor_id=doctor_id, patient_id=patient_id, report_id=report_id)
        self.db.add(access_request)
        self.db.commit()
        
        # Audit logging
        self.audit_service.append_event(
            event_type="ACCESS_REQUESTED",
            actor_id=doctor_id,
            actor_role="doctor",
            patient_id=patient_id,
            doctor_id=doctor_id,
            report_id=report_id,
            access_mode="normal"
        )
        
        return access_request

    def approve_request(self, request_id: int):
        access_request = self.db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
        if not access_request:
            raise ValueError("Access request not found")
        active_session = ActiveAccessSession(
            doctor_id=access_request.doctor_id,
            patient_id=access_request.patient_id,
            report_id=access_request.report_id,
            expires_at=datetime.now(timezone.utc) + ACCESS_SESSION_DURATION
        )
        self.db.add(active_session)
        self.db.delete(access_request)
        self.db.commit()
        
        # Audit logging
        self.audit_service.append_event(
            event_type="ACCESS_APPROVED",
            actor_id=access_request.doctor_id,
            actor_role="doctor",
            patient_id=access_request.patient_id,
            doctor_id=access_request.doctor_id,
            report_id=access_request.report_id,
            access_mode="normal"
        )
        
        return active_session

    def deny_request(self, request_id: int):
        access_request = self.db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
        if not access_request:
            raise ValueError("Access request not found")
        self.db.delete(access_request)
        self.db.commit()
        
        # Audit logging
        self.audit_service.append_event(
            event_type="ACCESS_DENIED",
            actor_id=access_request.doctor_id,
            actor_role="doctor",
            patient_id=access_request.patient_id,
            doctor_id=access_request.doctor_id,
            report_id=access_request.report_id,
            access_mode="normal"
        )
        
    def revoke_access(self, session_id: int):
        active_session = self.db.query(ActiveAccessSession).filter(ActiveAccessSession.id == session_id).first()
        if not active_session:
            raise ValueError("Active access session not found")
        self.db.delete(active_session)
        self.db.commit()

    def get_pending_requests(self, patient_id: int):
        return self.db.query(AccessRequest).filter(AccessRequest.patient_id == patient_id).all()

    def get_active_sessions(self, doctor_id: int, patient_id: int):
        return self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.expires_at > datetime.now(timezone.utc)
        ).all()

    def check_access_expiry(self):
        expired_sessions = self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.expires_at <= datetime.now(timezone.utc)
        ).all()
        
        for session in expired_sessions:
            # Log ACCESS_EXPIRED audit events BEFORE deleting sessions
            try:
                self.audit_service.append_event(
                    event_type="ACCESS_EXPIRED",
                    actor_id=session.doctor_id,
                    actor_role="doctor",
                    patient_id=session.patient_id,
                    doctor_id=session.doctor_id,
                    report_id=session.report_id,
                    access_mode="normal"
                )
            except Exception as e:
                print(f"Error logging ACCESS_EXPIRED event: {e}")
            
            self.db.delete(session)
        
        self.db.commit()
