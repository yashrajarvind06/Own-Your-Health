from sqlalchemy import Column, Integer, DateTime, String, JSON, Index
from datetime import datetime, timezone
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    timestamp_utc = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    event_type = Column(String(50), nullable=False)
    actor_id = Column(Integer, nullable=False)
    actor_role = Column(String(20), nullable=False)
    patient_id = Column(Integer, nullable=False)
    doctor_id = Column(Integer, nullable=True)
    report_id = Column(Integer, nullable=True)
    access_mode = Column(String(20), nullable=False)
    metadata = Column(JSON, nullable=True)

Index("idx_patient_timestamp", AuditLog.patient_id, AuditLog.timestamp_utc)
Index("idx_doctor_timestamp", AuditLog.doctor_id, AuditLog.timestamp_utc)
Index("idx_event_type", AuditLog.event_type)
Index("idx_access_mode", AuditLog.access_mode)
