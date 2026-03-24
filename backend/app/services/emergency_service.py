from datetime import datetime
from sqlalchemy.orm import Session
from app.models import EmergencyProfile
from app.services.audit_service import AuditService

class EmergencyService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def create_or_update_profile(self, patient_id: int, data: dict):
        profile = self.db.query(EmergencyProfile).filter(EmergencyProfile.user_id == patient_id).first()
        is_new = False
        
        if not profile:
            is_new = True
            profile = EmergencyProfile(user_id=patient_id)
            self.db.add(profile)
        
        # specific fields update
        if "blood_group" in data: profile.blood_group = data["blood_group"]
        if "allergies" in data: profile.allergies = data["allergies"]
        if "chronic_conditions" in data: profile.chronic_conditions = data["chronic_conditions"]
        if "past_surgeries" in data: profile.past_surgeries = data["past_surgeries"]
        if "emergency_contacts" in data: 
            # Ensure it's stored as list of dicts (JSON)
            profile.emergency_contacts = [c.dict() if hasattr(c, 'dict') else c for c in data["emergency_contacts"]]

        self.db.commit()
        self.db.refresh(profile)

        self.audit_service.append_event(
            event_type="EMERGENCY_PROFILE_CREATED" if is_new else "EMERGENCY_PROFILE_UPDATED",
            actor_id=patient_id,
            actor_role="patient",
            patient_id=patient_id,
            doctor_id=None,
            report_id=None,
            access_mode="normal"
        )
        return profile

    def get_emergency_profile(self, doctor_id: int, patient_id: int) -> dict:
        
        emergency_profile = self.db.query(EmergencyProfile).filter(EmergencyProfile.user_id == patient_id).first()
        
        if not emergency_profile:
            # We still want to log the ATTEMPT or create a session? 
            # If explicit intent is verified by router, we can proceed to create session even if profile is empty?
            # User wants to view it.
            # But if not found, we raise error.
            raise ValueError("Emergency profile not found")

        # Session Logic Removed: Access control is now handled by the Router via Dependency Injection
        # and Strict Context Checks (EmergencyAccess vs ActiveAccessSession).
        # This service is now purely a data fetcher.

        return {
            "user_id": emergency_profile.user_id,
            "blood_group": emergency_profile.blood_group,
            "allergies": emergency_profile.allergies,
            "chronic_conditions": emergency_profile.chronic_conditions,
            "past_surgeries": emergency_profile.past_surgeries,
            "emergency_contacts": emergency_profile.emergency_contacts,
            "updated_at": emergency_profile.updated_at
        }
    
    def get_profile_for_patient(self, patient_id: int):
        return self.db.query(EmergencyProfile).filter(EmergencyProfile.user_id == patient_id).first()
