from app.services.audit_service import AuditService

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError

from app.models import AccessRequest, ActiveAccessSession, QRToken, AuditLog, User, DoctorInteraction, DoctorPatientAccess
from app.services.doctor_directory import get_doctor_profile, verify_doctor
from app.enums import AccessDenyReason, DecisionActor

class AccessService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def _get_duration_delta(self, duration: str) -> timedelta:
        duration_map = {
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
            "1d": timedelta(days=1),
            "7d": timedelta(days=7)
        }
        return duration_map.get(duration, timedelta(minutes=15))

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
            request_source="QR",
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
        delta = self._get_duration_delta(duration)

        active_session = ActiveAccessSession(
            doctor_id=access_request.doctor_id,
            patient_id=access_request.patient_id,
            expires_at=datetime.utcnow() + delta,
            created_via="CONSENT"
        )

        self.db.add(active_session)
        self.db.delete(access_request)
        self.db.commit()
        self._activate_doctor_patient_access(
            doctor_id=active_session.doctor_id,
            patient_id=active_session.patient_id,
        )
        self.update_doctor_interaction(
            patient_id=access_request.patient_id,
            doctor_id=access_request.doctor_id,
        )

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

    def create_direct_access_request(self, patient_id: int, doctor_id: int, reason: str) -> AccessRequest:
        clean_reason = (reason or "").strip()
        if not clean_reason:
            raise ValueError("Reason is required")

        doctor = self.db.query(User).filter(
            User.id == doctor_id,
            User.role == "doctor",
        ).first()
        if not doctor:
            raise ValueError("Doctor not found")

        if not verify_doctor(self._get_doctor_hpr_id(doctor_id)):
            raise ValueError("Only HPR-verified doctors can request access")

        if patient_id == doctor_id:
            raise ValueError("You cannot request access from yourself")

        existing_request = self.db.query(AccessRequest).filter(
            AccessRequest.patient_id == patient_id,
            AccessRequest.doctor_id == doctor_id,
            AccessRequest.status.in_(["pending", "PENDING"]),
        ).first()
        if existing_request:
            raise ValueError("A pending access request already exists for this doctor")

        access_request = AccessRequest(
            qr_token_id=self._get_direct_request_qr_token_id(patient_id),
            doctor_id=doctor_id,
            patient_id=patient_id,
            status="pending",
            request_source="SEARCH",
            access_reason=clean_reason,
            reason_note=None,
        )
        self.db.add(access_request)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ValueError("Unable to create access request")
        self.db.refresh(access_request)
        return access_request

    def _get_doctor_hpr_id(self, doctor_id: int) -> str:
        return get_doctor_profile(doctor_id)["hpr_id"]

    def get_doctor_direct_requests(self, doctor_id: int):
        return self.db.query(AccessRequest, User).join(
            User, AccessRequest.patient_id == User.id
        ).filter(
            AccessRequest.doctor_id == doctor_id,
            AccessRequest.request_source == "SEARCH",
            AccessRequest.status.in_(["pending", "PENDING"]),
        ).order_by(AccessRequest.created_at.desc()).all()

    def respond_to_direct_request(self, request_id: int, doctor_id: int, decision: str, duration: str = "15m"):
        access_request = self.db.query(AccessRequest).filter(
            AccessRequest.id == request_id,
            AccessRequest.doctor_id == doctor_id,
            AccessRequest.request_source == "SEARCH",
        ).first()

        if not access_request:
            raise ValueError("Direct access request not found")

        normalized_decision = (decision or "").upper()
        if normalized_decision not in {"APPROVED", "DENIED"}:
            raise ValueError("Invalid decision")

        if normalized_decision == "DENIED":
            access_request.status = "DENIED"
            self.db.commit()
            self.audit_service.append_event(
                event_type="ACCESS_DENIED",
                actor_id=doctor_id,
                actor_role="doctor",
                patient_id=access_request.patient_id,
                doctor_id=doctor_id,
                report_id=None,
                access_mode="normal",
                reason="DOCTOR_DECLINED",
                decision_by="DOCTOR",
            )
            return {"status": "DENIED"}

        active_session = ActiveAccessSession(
            doctor_id=access_request.doctor_id,
            patient_id=access_request.patient_id,
            expires_at=datetime.utcnow() + self._get_duration_delta(duration),
            created_via="CONSENT"
        )
        self.db.add(active_session)
        self.db.delete(access_request)
        self.db.commit()
        self._activate_doctor_patient_access(
            doctor_id=active_session.doctor_id,
            patient_id=active_session.patient_id,
        )
        self.update_doctor_interaction(
            patient_id=active_session.patient_id,
            doctor_id=active_session.doctor_id,
        )
        self.audit_service.append_event(
            event_type="ACCESS_APPROVED",
            actor_id=doctor_id,
            actor_role="doctor",
            patient_id=active_session.patient_id,
            doctor_id=doctor_id,
            report_id=None,
            access_mode="normal",
            access_reason=f"SEARCH_REQUEST_ACCEPTED ({duration})",
        )
        return {"status": "APPROVED", "session_id": active_session.id}

    def _get_direct_request_qr_token_id(self, patient_id: int) -> int | None:
        existing_token = self.db.query(QRToken).filter(
            QRToken.patient_id == patient_id
        ).order_by(QRToken.created_at.desc()).first()

        if existing_token is not None:
            return existing_token.id

        fallback_token = QRToken(
            token=f"search-request-{patient_id}-{int(datetime.utcnow().timestamp())}",
            patient_id=patient_id,
            expires_at=datetime.utcnow(),
            revoked=True,
        )
        self.db.add(fallback_token)
        self.db.flush()
        return fallback_token.id

    def update_doctor_interaction(self, patient_id: int, doctor_id: int) -> None:
        interaction = self.db.query(DoctorInteraction).filter(
            DoctorInteraction.patient_id == patient_id,
            DoctorInteraction.doctor_id == doctor_id,
        ).first()

        if interaction is None:
            interaction = DoctorInteraction(
                patient_id=patient_id,
                doctor_id=doctor_id,
                interaction_count=0,
            )
            self.db.add(interaction)

        interaction.interaction_count += 1
        interaction.last_interacted_at = datetime.utcnow()
        self.db.commit()

    def _activate_doctor_patient_access(self, doctor_id: int, patient_id: int) -> None:
        access = self.db.query(DoctorPatientAccess).filter(
            DoctorPatientAccess.doctor_id == doctor_id,
            DoctorPatientAccess.patient_id == patient_id,
        ).first()

        now = datetime.utcnow()
        if access is None:
            access = DoctorPatientAccess(
                doctor_id=doctor_id,
                patient_id=patient_id,
                access_granted_at=now,
                access_revoked_at=None,
                is_active=True,
            )
            self.db.add(access)
        else:
            access.is_active = True
            access.access_granted_at = now
            access.access_revoked_at = None

        self.db.commit()

    def _deactivate_doctor_patient_access(self, doctor_id: int, patient_id: int, revoked_at: datetime | None = None) -> None:
        access = self.db.query(DoctorPatientAccess).filter(
            DoctorPatientAccess.doctor_id == doctor_id,
            DoctorPatientAccess.patient_id == patient_id,
        ).first()
        if access is None:
            return

        access.is_active = False
        access.access_revoked_at = revoked_at or datetime.utcnow()
        self.db.commit()

    def sync_doctor_patient_access(self, doctor_id: int) -> None:
        now = datetime.utcnow()
        active_pairs = {
            (session.doctor_id, session.patient_id)
            for session in self.db.query(ActiveAccessSession).filter(
                ActiveAccessSession.doctor_id == doctor_id,
                ActiveAccessSession.revoked_at.is_(None),
                ActiveAccessSession.expires_at > now,
            ).all()
        }

        records = self.db.query(DoctorPatientAccess).filter(
            DoctorPatientAccess.doctor_id == doctor_id
        ).all()

        changed = False
        for record in records:
            should_be_active = (record.doctor_id, record.patient_id) in active_pairs
            if should_be_active and not record.is_active:
                record.is_active = True
                record.access_revoked_at = None
                changed = True
            elif not should_be_active and record.is_active:
                record.is_active = False
                record.access_revoked_at = now
                changed = True

        if changed:
            self.db.commit()

    def has_doctor_patient_access(self, doctor_id: int, patient_id: int) -> bool:
        self.sync_doctor_patient_access(doctor_id)
        access = self.db.query(DoctorPatientAccess).filter(
            DoctorPatientAccess.doctor_id == doctor_id,
            DoctorPatientAccess.patient_id == patient_id,
        ).first()
        return access is not None

    def get_doctor_active_patients(self, doctor_id: int):
        self.sync_doctor_patient_access(doctor_id)
        return self.db.query(DoctorPatientAccess, User).join(
            User, DoctorPatientAccess.patient_id == User.id
        ).filter(
            DoctorPatientAccess.doctor_id == doctor_id,
            DoctorPatientAccess.is_active.is_(True),
        ).order_by(DoctorPatientAccess.access_granted_at.desc()).all()

    def get_doctor_patient_history(self, doctor_id: int):
        self.sync_doctor_patient_access(doctor_id)
        return self.db.query(DoctorPatientAccess, User).join(
            User, DoctorPatientAccess.patient_id == User.id
        ).filter(
            DoctorPatientAccess.doctor_id == doctor_id,
        ).order_by(
            DoctorPatientAccess.is_active.desc(),
            DoctorPatientAccess.access_granted_at.desc(),
        ).all()

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
        self._deactivate_doctor_patient_access(
            doctor_id=doctor_id,
            patient_id=patient_id,
            revoked_at=now,
        )

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
        self.sync_doctor_patient_access(doctor_id)
        now = datetime.utcnow()
        output = []



        # 2. NORMAL SESSIONS
        normal_sessions = self.db.query(ActiveAccessSession, User).outerjoin(
            User, ActiveAccessSession.patient_id == User.id
        ).filter(
            ActiveAccessSession.doctor_id == doctor_id,
            ActiveAccessSession.revoked_at.is_(None), # Filter revoked
            ActiveAccessSession.expires_at > now
        ).order_by(ActiveAccessSession.expires_at.asc()).all()

        for session, patient in normal_sessions:

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



        # 2. NORMAL SESSIONS
        normal_sessions = self.db.query(ActiveAccessSession, User).outerjoin(
            User, ActiveAccessSession.doctor_id == User.id
        ).filter(
            ActiveAccessSession.patient_id == patient_id,
            ActiveAccessSession.revoked_at.is_(None),
            ActiveAccessSession.expires_at > now
        ).all()

        for session, doctor in normal_sessions:

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
