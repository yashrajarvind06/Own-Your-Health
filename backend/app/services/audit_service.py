from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import AuditLog

from typing import Optional

class AuditService:
    def __init__(self, db: Session):
        self.db = db

    def append_event(self, event_type: str, actor_id: int, actor_role: str, patient_id: int, doctor_id: Optional[int], report_id: Optional[int] | str, access_mode: str, reason: Optional[str] = None, decision_by: Optional[str] = None, access_context: Optional[str] = None, access_reason: Optional[str] = None):
        # Serialize details for schema compatibility
        details_str = f"Event: {event_type}, Role: {actor_role}, Access: {access_mode}"
        if access_context:
            details_str += f", Context: {access_context}"
        if access_reason:
            details_str += f", ReasonCode: {access_reason}"
        if doctor_id:
            details_str += f", Doctor: {doctor_id}"
        if report_id:
            details_str += f", Report: {report_id}"
        
        # Strict Denial Fields
        if reason:
            details_str += f", Reason: {reason}"
        if decision_by:
            details_str += f", DecisionBy: {decision_by}"

        audit_log = AuditLog(
            actor_user_id=actor_id,
            patient_id=patient_id,
            details=details_str
        )
        self.db.add(audit_log)
        self.db.commit()
