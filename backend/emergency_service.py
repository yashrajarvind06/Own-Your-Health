from datetime import datetime
import jwt
from sqlalchemy.orm import Session
from app.deps import get_db, SECRET_KEY
from app.models import User, EmergencyProfile
from app.services.audit_service import AuditService

class EmergencyService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def get_emergency_profile(self, doctor_id: int, patient_id: int) -> dict:
        emergency_profile = self.db.query(EmergencyProfile).filter(EmergencyProfile.user_id == patient_id).first()
        if not emergency_profile:
            raise ValueError("Emergency profile not found")
        
        # Audit logging
        self.audit_service.append_event(
            event_type="EMERGENCY_ACCESS",
            actor_id=doctor_id,
            actor_role="doctor",
            patient_id=patient_id,
            doctor_id=doctor_id,
            report_id=None,
            access_mode="emergency"
        )
        
        return {
            "user_id": emergency_profile.user_id,
            "contact_info": emergency_profile.contact_info,
            "emergency_contacts": emergency_profile.emergency_contacts
        }
