from sqlalchemy.orm import Session, joinedload
from app.models import AuditLog, User
from datetime import datetime

class LogService:
    # Strict Allow-List for Audit Logging
    ALLOWED_INTENTS = {
        # Data Access Events
        "VIEW_REPORTS": "DATA_ACCESS",
        "VIEW_EMERGENCY_PROFILE": "DATA_ACCESS",
        
        # Authorization Events
        "ACCESS_REQUESTED": "AUTHORIZATION",
        "ACCESS_APPROVED": "AUTHORIZATION",
        "ACCESS_DENIED": "AUTHORIZATION",
        "EMERGENCY_OVERRIDE": "AUTHORIZATION",
        "QR_VALIDATED": "AUTHORIZATION",
        
        # System/Other (Strictly controlled)
        "UPLOAD_REPORT": "DATA_WRITE" 
    }

    def __init__(self, db: Session):
        self.db = db

    def log_accessible_action(self, 
                            actor_user_id: int, 
                            patient_id: int, 
                            event_type: str, 
                            details_dict: dict = None,
                            access_mode: str = "NORMAL",
                            access_context: str = "NORMAL",
                            session_id: int = None):
        """
        Centralized Audit Guard.
        Only logs events that are in the ALLOWED_INTENTS list.
        """
        if event_type not in self.ALLOWED_INTENTS:
            # Silently skip logging for non-allowed events (e.g., navigation, status checks)
            return None

        # Build standard details map
        actor = self.db.query(User).filter(User.id == actor_user_id).first()
        role = actor.role if actor else "unknown"

        data = {
            "Event": event_type,
            "Access": access_mode,
            "Context": access_context,
            "Role": role,
            "Category": self.ALLOWED_INTENTS[event_type]
        }
        
        if details_dict:
            data.update(details_dict)
            
        # Convert to Legacy String Format: "Key: Value, Key2: Value2"
        # This converts all values to string to ensure join works
        details_str = ", ".join([f"{k}: {v}" for k, v in data.items()])
        
        # Create Audit Log (Forensic Trail)
        audit = AuditLog(
            actor_user_id=actor_user_id,
            patient_id=patient_id,
            details=details_str
        )
        self.db.add(audit)
        self.db.commit()
        return audit

    def get_patient_logs(self, patient_id: int):
        return self.db.query(AuditLog).options(
            joinedload(AuditLog.actor_user),
            joinedload(AuditLog.patient)
        ).filter(AuditLog.patient_id == patient_id).order_by(AuditLog.created_at.desc()).all()

    def get_doctor_logs(self, doctor_id: int):
        # Filter by Doctor as Actor OR Doctor as subject in details (e.g. Patient Denied Doctor)
        # We need strict LIKE to avoid partial matches (e.g. Doctor: 1 matching Doctor: 11)
        # Ideally we'd use JSON, but for Text column we use formatted string.
        # "Doctor: <id>" is the format.
        from sqlalchemy import or_
        return self.db.query(AuditLog).options(
            joinedload(AuditLog.actor_user),
            joinedload(AuditLog.patient)
        ).filter(
            or_(
                AuditLog.actor_user_id == doctor_id,
                AuditLog.details.like(f"%Doctor: {doctor_id}%"),
                AuditLog.details.like(f"%Doctor: {doctor_id},%") # Handle usage in middle of string if formatting changes
            )
        ).order_by(AuditLog.created_at.desc()).all()
