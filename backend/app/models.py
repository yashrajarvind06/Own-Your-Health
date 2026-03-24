from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from sqlalchemy import UniqueConstraint

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    display_name = Column(String(255), nullable=True)
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
    qr_token_id = Column(Integer, ForeignKey("qr_tokens.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False)
    
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


class EmergencyProfile(Base):
    __tablename__ = "emergency_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True, nullable=False)
    blood_group = Column(String(10), nullable=True)
    allergies = Column(Text, nullable=True)
    chronic_conditions = Column(Text, nullable=True)
    past_surgeries = Column(Text, nullable=True) # Added per user request
    emergency_contacts = Column(JSON, nullable=False) # List of {name, phone, relation}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class EmergencyAccess(Base):
    __tablename__ = "emergency_access"
    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

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
