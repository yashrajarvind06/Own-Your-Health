from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base
from sqlalchemy import UniqueConstraint

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    display_name = Column(String(255), nullable=True)
    # HPR ID for doctors, HFR ID for labs; verified_at is set only after a registry match
    registry_id = Column(String(50), unique=True, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    # Patient identity (docx: ABHA login, mobile OTP fallback)
    phone = Column(String(20), unique=True, nullable=True)
    phone_verified_at = Column(DateTime, nullable=True)
    abha_number = Column(String(20), unique=True, nullable=True)
    abha_address = Column(String(100), nullable=True)
    abha_verified_at = Column(DateTime, nullable=True)
    health_alerts_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    profile = relationship("PatientProfile", back_populates="user", uselist=False)

class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    blood_group = Column(String(10), nullable=True)
    allergies = Column(Text, nullable=True)
    chronic_diseases = Column(Text, nullable=True)
    medications = Column(Text, nullable=True)
    emergency_contact = Column(String(100), nullable=True)
    past_surgeries = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="profile")

class QRToken(Base):
    __tablename__ = "qr_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class AccessRequest(Base):
    __tablename__ = "access_requests"
    id = Column(Integer, primary_key=True, index=True)
    qr_token_id = Column(Integer, ForeignKey("qr_tokens.id"), nullable=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False)
    request_source = Column(String(20), nullable=False, default="QR")
    
    # Phase 2: Access Reason
    access_reason = Column(String(50), nullable=False) # Code: FOLLOW_UP, DIAGNOSTIC, etc.
    reason_note = Column(Text, nullable=True)          # Optional free text
    
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    doctor = relationship("User", foreign_keys=[doctor_id])

class ActiveAccessSession(Base):
    __tablename__ = "active_access_sessions"
    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_via = Column(String(50), nullable=False, default="CONSENT") # CONSENT | EMERGENCY_OVERRIDE
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Phase 3: Revocation
    revoked_at = Column(DateTime, nullable=True) 
    revoked_by = Column(Integer, ForeignKey("users.id"), nullable=True) 
    revocation_source = Column(String(50), nullable=True) # PATIENT | DOCTOR | SYSTEM
    revocation_reason = Column(String(255), nullable=True)

class DoctorInteraction(Base):
    __tablename__ = "doctor_interactions"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    interaction_count = Column(Integer, nullable=False, default=0)
    last_interacted_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('patient_id', 'doctor_id', name='uq_doctor_interaction_pair'),
    )

class DoctorPatientAccess(Base):
    __tablename__ = "doctor_patient_access"
    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    access_granted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    access_revoked_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint('doctor_id', 'patient_id', name='uq_doctor_patient_access_pair'),
    )

class MedicalReport(Base):
    __tablename__ = "medical_reports"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_key = Column(String(255), nullable=False)
    sha256_hash = Column(String(255), nullable=False)
    report_id = Column(String(100), nullable=False)
    blockchain_tx = Column(String(255), nullable=False)
    extracted_text = Column(Text, nullable=True)
    summary = Column(String(255), nullable=True)
    bp_systolic = Column(Integer, nullable=True)
    bp_diastolic = Column(Integer, nullable=True)
    heart_rate = Column(Integer, nullable=True)
    glucose = Column(Integer, nullable=True)
    report_date = Column(DateTime, nullable=True)
    uploaded_by = Column(String(20), nullable=False, default="PATIENT")
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    record_type = Column(String(50), nullable=True)
    user_summary = Column(String(280), nullable=True)  # 1-2 lines typed by the uploader
    weight = Column(Integer, nullable=True)
    temperature = Column(String(10), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)  # soft delete: restorable backup
    ai_summary = Column(String(300), nullable=True)  # Gemini one-liner
    ai_details = Column(JSON, nullable=True)  # Gemini summary, values, takeaways, discuss
    ai_status = Column(String(12), nullable=True)  # PENDING | DONE | FAILED; NULL = not generated
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # View-only relationships for name resolution
    actor_user = relationship("User", foreign_keys=[actor_user_id], viewonly=True)
    patient = relationship("User", foreign_keys=[patient_id], viewonly=True)

class AccessLog(Base):
    __tablename__ = "access_logs"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    access_mode = Column(String(50), nullable=False)  # NORMAL | EMERGENCY
    action = Column(String(50), nullable=False)       # REQUESTED | APPROVED | DENIED | VIEWED | EXPIRED
    session_id = Column(Integer, ForeignKey("active_access_sessions.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)




class ReportAccess(Base):
    __tablename__ = "report_access"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("active_access_sessions.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("medical_reports.id"), nullable=False)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    granted_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    session = relationship("ActiveAccessSession")
    report = relationship("MedicalReport")

    __table_args__ = (
        UniqueConstraint('session_id', 'report_id', name='uq_session_report'),
    )

class ReportAccessRequest(Base):
    __tablename__ = "report_access_requests"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("active_access_sessions.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("medical_reports.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING") # PENDING, APPROVED, DENIED
    reason = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('session_id', 'report_id', name='uq_request_session_report'),
    )

class EmergencyToken(Base):
    __tablename__ = "emergency_tokens"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(255), nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    patient = relationship("User", foreign_keys=[patient_id])

class EmergencyAccessLog(Base):
    __tablename__ = "emergency_access_logs"
    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("emergency_tokens.id"), nullable=False)
    scanned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ip_address = Column(String(50), nullable=True)
    device_type = Column(String(255), nullable=True)
    approx_location = Column(String(255), nullable=True)

    token = relationship("EmergencyToken")

class EmergencyQRProfile(Base):
    __tablename__ = "emergency_qr_profiles"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    emergency_contact = Column(String(255), nullable=True)
    date_of_birth = Column(String(20), nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    blood_group = Column(String(10), nullable=True)
    chronic_conditions = Column(Text, nullable=True)
    medications = Column(Text, nullable=True)
    surgeries = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True)
    organ_donor_status = Column(String(10), nullable=True)
    organ_donor_details = Column(Text, nullable=True)
    pregnancy_status = Column(String(50), nullable=True)
    # Random public id for the card/QR URL so cards can't be enumerated by patient id
    card_token = Column(String(64), unique=True, nullable=True, index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    patient = relationship("User", foreign_keys=[patient_id])


class ReportComment(Base):
    """Doctor-only notes on a report (docx: comments visible to doctors only)."""
    __tablename__ = "report_comments"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("medical_reports.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    doctor = relationship("User", foreign_keys=[doctor_id])


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(255), nullable=False, index=True)  # the phone or email the code is for
    purpose = Column(String(30), nullable=False)  # LOGIN | FAMILY_LINK | ABHA_LINK | SIGNUP | RESET
    code_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FamilyDelegate(Base):
    """A family member/caregiver the patient lets act for them, with explicit permissions."""
    __tablename__ = "family_delegates"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    relation = Column(String(50), nullable=False)
    phone = Column(String(20), nullable=False, index=True)  # the delegate is whoever holds this verified phone
    permissions = Column(JSON, nullable=False, default=list)  # EMERGENCY | VIEW_RECORDS | UPLOAD | APPROVE_ACCESS
    is_primary_caregiver = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=True)  # None = permanent until revoked
    verified_at = Column(DateTime, nullable=True)  # OTP confirmed on the member's phone
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("User", foreign_keys=[patient_id])



class Alert(Base):
    """Misuse alerts shown to the patient (docx: trigger an alert, NOT a block)."""
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    rule = Column(String(40), nullable=False)  # TOO_MANY_PATIENTS | ODD_HOURS | NO_ACTIVE_CONSENT | DELEGATE_OVERUSE
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    seen_at = Column(DateTime, nullable=True)


class ShareLink(Base):
    """Patient-made, time-limited link to chosen records (docx: give access via secured link / QR, by time and no. of reports)."""
    __tablename__ = "share_links"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_ids = Column(JSON, nullable=False, default=list)
    note = Column(String(120), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    view_count = Column(Integer, nullable=False, default=0)
    last_viewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DoctorFeedback(Base):
    """A patient's 1-5 rating of a doctor they actually had a consent session with (one per pair, editable)."""
    __tablename__ = "doctor_feedback"
    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(String(280), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("doctor_id", "patient_id", name="uq_feedback_pair"),)


class DoctorEndorsement(Base):
    """Community verification: a verified doctor vouches for another doctor."""
    __tablename__ = "doctor_endorsements"
    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endorsed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("doctor_id", "endorsed_by", name="uq_endorsement_pair"),)


class HealthHistory(Base):
    """The patient's saved AI (or rule-based) health history, built from all their records."""
    __tablename__ = "health_histories"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    content = Column(JSON, nullable=False)
    source = Column(String(10), nullable=False)  # AI | RULES
    report_count = Column(Integer, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)


class HealthHistoryShare(Base):
    """A patient sharing their health history with one doctor, until revoked."""
    __tablename__ = "health_history_shares"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
