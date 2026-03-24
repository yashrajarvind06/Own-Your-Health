from app.services.audit_service import AuditService

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models import AccessRequest, ActiveAccessSession, QRToken, AuditLog, User, EmergencyAccess
from app.enums import AccessDenyReason, DecisionActor

class AccessService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def request_access(self, doctor_id: int, patient_id: int, report_id: str, token: str, access_context: str = "NORMAL", access_reason: str = None, reason_note: str = None):
        # Resolve QR Token ID
        qr_token_record = self.db.query(QRToken).filter(QRToken.token == token).first()
        if not qr_token_record:
             raise ValueError("Invalid QR Token")

        # Guardrail: Reason is Mandatory
        if not access_reason or not access_reason.strip():
            raise ValueError("Access Reason is mandatory.")

        access_request = AccessRequest(
            doctor_id=doctor_id,
            patient_id=patient_id,
            qr_token_id=qr_token_record.id,
            status="pending",
            access_reason=access_reason,
            reason_note=reason_note
        )
        self.db.add(access_request)
        self.db.commit()

        self.audit_service.append_event(
            event_type="ACCESS_REQUESTED",
            actor_id=doctor_id,
            actor_role="doctor",
            patient_id=patient_id,
            doctor_id=doctor_id,
            report_id=report_id,
            access_mode="normal",
            access_context=access_context,
            access_reason=access_reason
        )

        return access_request

    def approve_request(self, request_id: int, duration: str = "15m"):
        print(f"DEBUG: Approving Request ID: {request_id}")
        access_request = self.db.query(AccessRequest).filter(
            AccessRequest.id == request_id
        ).first()

        if not access_request:
            all_ids = [r.id for r in self.db.query(AccessRequest).all()]
            print(f"DEBUG: Request {request_id} NOT FOUND. Existing IDs: {all_ids}")
            raise ValueError(f"Access request {request_id} not found. Available: {all_ids}")

        # Parse Duration
        duration_map = {
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
            "1d": timedelta(days=1),
            "7d": timedelta(days=7)
        }
        delta = duration_map.get(duration, timedelta(minutes=15)) # Safe default

        active_session = ActiveAccessSession(
            doctor_id=access_request.doctor_id,
            patient_id=access_request.patient_id,
            expires_at=datetime.utcnow() + delta,
            created_via="CONSENT"
        )

        self.db.add(active_session)
        self.db.delete(access_request)
        self.db.commit()

        self.audit_service.append_event(
            event_type="ACCESS_APPROVED",
            actor_id=access_request.patient_id,
            actor_role="patient",
            patient_id=access_request.patient_id,
            doctor_id=access_request.doctor_id,
            report_id=None,
            access_mode="normal",
            access_reason=f"{access_request.access_reason} (Duration: {duration})" # Carry forward context
        )

        return active_session

    def deny_request(self, request_id: int, reason: AccessDenyReason, decision_by: DecisionActor):
        access_request = self.db.query(AccessRequest).filter(
            AccessRequest.id == request_id
        ).first()

        if not access_request:
            raise ValueError("Access request not found")

        # MARK as DENIED instead of deleting
        access_request.status = "DENIED"
        self.db.commit()

        self.audit_service.append_event(
            event_type="ACCESS_DENIED",
            actor_id=access_request.patient_id if decision_by == DecisionActor.PATIENT else access_request.doctor_id, # Simplified attribution
            actor_role=decision_by.value.lower(),
            patient_id=access_request.patient_id,
            doctor_id=access_request.doctor_id,
            report_id=None,
            access_mode="normal",
            reason=reason.value,
            decision_by=decision_by.value
        )
    
        return {
            "status": "DENIED",
            "reason": reason.value,
            "decision_by": decision_by.value, 
            "timestamp": datetime.utcnow().isoformat()
        }

    def get_pending_requests(self, patient_id: int):
        return self.db.query(AccessRequest).filter(
            AccessRequest.patient_id == patient_id,
            AccessRequest.status == "pending" # Only show pending
        ).all()

    def revoke_session(self, doctor_id: int, patient_id: int, revoked_by: int, revocation_source: str, revocation_reason: str):
        """
        Explicitly revokes an active session.
        """
        now = datetime.utcnow()
        session = self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.revoked_at.is_(None),
            ActiveAccessSession.expires_at > now
        ).first()

        if not session:
            return None # No active session to revoke

        session.revoked_at = now
        session.revoked_by = revoked_by
        session.revocation_source = revocation_source
        session.revocation_reason = revocation_reason
        
        self.db.commit()

        # Log Revocation
        self.audit_service.append_event(
            event_type="ACCESS_REVOKED",
            actor_id=revoked_by,
            actor_role=revocation_source.lower(), # patient, doctor, system
            patient_id=patient_id,
            doctor_id=doctor_id,
            report_id=None,
            access_mode="normal",
            reason=f"{revocation_source}: {revocation_reason}"
        )
        return session

    def get_smart_status(self, doctor_id: int, patient_id: int) -> dict:
        """
        Derives production-grade status.
        CRITICAL: Denial overrides ALL other states.
        """
        now = datetime.utcnow()

        # 1. EMERGENCY OVERRIDE (Highest Priority - Safety First)
        emergency_access = self.db.query(EmergencyAccess).filter(
            EmergencyAccess.doctor_id == doctor_id,
            EmergencyAccess.patient_id == patient_id,
            EmergencyAccess.expires_at > now
        ).first()

        if emergency_access:
            remaining = int((emergency_access.expires_at - now).total_seconds())
            return {
                "status": "EMERGENCY",
                "session": None,
                "remaining_seconds": remaining
            }

        # 2. ACTIVE SESSION (Standard Grant)
        # Priority: If a valid session exists, it supersedes previous denials.
        # MUST CHECK FOR REVOCATION
        active_session = self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.revoked_at.is_(None) # Ensure NOT revoked
        ).order_by(ActiveAccessSession.expires_at.desc()).first()

        session_expired = False
        if active_session:
            remaining = int((active_session.expires_at - now).total_seconds())
            if remaining > 0:
                return {
                    "status": "GRANTED",
                    "session": active_session,
                    "remaining_seconds": remaining
                }
            else:
                session_expired = True

        # 2.5 CHECK FOR REVOCATION (Explicit Early Exit)
        # If we are here, there is NO active session. Check if there WAS one recently revoked.
        revoked_session = self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.revoked_at.isnot(None), 
            ActiveAccessSession.expires_at > now # Only show revoked if it WOULD have been active otherwise
        ).order_by(ActiveAccessSession.revoked_at.desc()).first()

        if revoked_session:
             return {
                "status": "REVOKED",
                "reason": revoked_session.revocation_reason,
                "revoked_by": revoked_session.revocation_source, # e.g. "DOCTOR"
                "timestamp": revoked_session.revoked_at.isoformat(),
                "session": None,
                "remaining_seconds": 0
            }

        # 3. CHECK FOR DENIAL (Blocks New Requests if no session exists)
        # Search AuditLogs for denied event in the last 10 minutes
        denial_log = self.db.query(AuditLog).filter(
            AuditLog.created_at >= now - timedelta(minutes=10),
            AuditLog.patient_id == patient_id,
            AuditLog.details.like("%Event: ACCESS_DENIED%"),
            AuditLog.details.like(f"%Doctor: {doctor_id}%")
        ).order_by(AuditLog.created_at.desc()).first()

        if denial_log:
            # Parse reason and actor
            reason = "UNKNOWN"
            decision_by = "UNKNOWN"
            if denial_log.details:
                parts = denial_log.details.split(", ")
                for p in parts:
                    if p.startswith("Reason: "):
                        reason = p.replace("Reason: ", "")
                    if p.startswith("DecisionBy: "):
                        decision_by = p.replace("DecisionBy: ", "")
            
            return {
                "status": "DENIED",
                "reason": reason,
                "denied_by": decision_by,
                "decision_by": decision_by,
                "timestamp": denial_log.created_at.isoformat(),
                "session": None,
                "remaining_seconds": 0
            }

        # 4. WAITING_APPROVAL
        pending = self.db.query(AccessRequest).filter(
            AccessRequest.doctor_id == doctor_id,
            AccessRequest.patient_id == patient_id,
            AccessRequest.status == "pending"
        ).first()

        if pending:
             return {
                "status": "WAITING_APPROVAL",
                "session": None,
                "remaining_seconds": None
             }
        
        # 5. QR VERIFIED (Fallback from Audit Logs? Or assume IDLE if no request)
        # Using AuditLog check for QR_VALIDATED
        qr_log = self.db.query(AuditLog).filter(
            AuditLog.created_at >= now - timedelta(minutes=5),
            AuditLog.patient_id == patient_id,
            AuditLog.details.like("%Event: QR_VALIDATED%"),
            AuditLog.details.like(f"%Doctor: {doctor_id}%")
        ).order_by(AuditLog.created_at.desc()).first()

        if qr_log:
             return {
                "status": "QR_VERIFIED",
                "session": None,
                "remaining_seconds": None
             }

        # 6. EXPIRED (Fallback if no other state)
        if session_expired:
             return {
                "status": "EXPIRED",
                "session": active_session,
                "remaining_seconds": 0
            }

        # 7. IDLE
        return {
            "status": "IDLE",
            "session": None,
            "remaining_seconds": None
        }

    def get_all_doctor_sessions(self, doctor_id: int):
        return self.db.query(ActiveAccessSession).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.revoked_at.is_(None), # Filter revoked
            ActiveAccessSession.expires_at > datetime.now(timezone.utc)
        ).all()

    def get_doctor_active_sessions(self, doctor_id: int):
        now = datetime.utcnow()
        output = []

        # 1. EMERGENCY OVERRIDES (High Priority)
        # We need to import User again because it's used in join
        emergency_sessions = self.db.query(EmergencyAccess, User).outerjoin(
            User, EmergencyAccess.patient_id == User.id
        ).filter(
            EmergencyAccess.doctor_id == doctor_id,
            EmergencyAccess.expires_at > now
        ).all()

        for session, patient in emergency_sessions:
            remaining = int((session.expires_at - now).total_seconds())
            if patient and patient.email:
                p_name = patient.email
            else:
                p_name = f"Patient {session.patient_id}"

            output.append({
                "patient_id": session.patient_id,
                "patient_name": p_name,
                "expires_at": session.expires_at,
                "remaining_seconds": remaining,
                "access_mode": "EMERGENCY" # Explicit Mode
            })

        # 2. NORMAL SESSIONS
        normal_sessions = self.db.query(ActiveAccessSession, User).outerjoin(
            User, ActiveAccessSession.patient_id == User.id
        ).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.revoked_at.is_(None), # Filter revoked
            ActiveAccessSession.expires_at > now
        ).order_by(ActiveAccessSession.expires_at.asc()).all()

        for session, patient in normal_sessions:
            # Dedup: If Emergency exists, skip Normal
            existing = next((x for x in output if x["patient_id"] == session.patient_id), None)
            if existing:
                continue 

            remaining = int((session.expires_at - now).total_seconds())
            if remaining < 0:
                continue 
            
            if patient and patient.email:
                p_name = patient.email
            else:
                p_name = f"Patient {session.patient_id}"

            output.append({
                "patient_id": session.patient_id,
                "patient_name": p_name,
                "expires_at": session.expires_at,
                "remaining_seconds": remaining,
                "access_mode": "NORMAL"
            })
        
        return output

    def get_patient_active_sessions(self, patient_id: int):
        now = datetime.utcnow()
        output = []

        # 1. EMERGENCY OVERRIDES
        emergency_sessions = self.db.query(EmergencyAccess, User).outerjoin(
            User, EmergencyAccess.doctor_id == User.id
        ).filter(
            EmergencyAccess.patient_id == patient_id,
            EmergencyAccess.expires_at > now
        ).all()

        for session, doctor in emergency_sessions:
            remaining = int((session.expires_at - now).total_seconds())
            d_name = doctor.display_name if doctor else f"Doctor {session.doctor_id}"
            
            output.append({
                "doctor_id": session.doctor_id,
                "doctor_name": d_name,
                "access_mode": "EMERGENCY",
                "expires_at": session.expires_at,
                "remaining_seconds": remaining,
                "revocable": False
            })

        # 2. NORMAL SESSIONS
        normal_sessions = self.db.query(ActiveAccessSession, User).outerjoin(
            User, ActiveAccessSession.doctor_id == User.id
        ).filter(
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.revoked_at.is_(None),
            ActiveAccessSession.expires_at > now
        ).all()

        for session, doctor in normal_sessions:
            # Dedup
            existing = next((x for x in output if x["doctor_id"] == session.doctor_id), None)
            if existing: continue

            remaining = int((session.expires_at - now).total_seconds())
            d_name = doctor.display_name if doctor else f"Doctor {session.doctor_id}"

            output.append({
                "doctor_id": session.doctor_id,
                "doctor_name": d_name,
                "access_mode": "NORMAL",
                "expires_at": session.expires_at,
                "remaining_seconds": remaining,
                "revocable": True
            })

        return output
