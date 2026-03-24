from enum import Enum

class AccessDenyReason(str, Enum):
    PATIENT_REJECTED = "PATIENT_REJECTED"
    EXPIRED = "EXPIRED"
    INSUFFICIENT_PERMISSION = "INSUFFICIENT_PERMISSION"
    INVALID_SESSION = "INVALID_SESSION"
    SYSTEM_POLICY = "SYSTEM_POLICY"

class DecisionActor(str, Enum):
    PATIENT = "PATIENT"
    SYSTEM = "SYSTEM"
    DOCTOR = "DOCTOR"

class RevocationSource(str, Enum):
    SYSTEM = "SYSTEM"
    DOCTOR = "DOCTOR"
    PATIENT = "PATIENT"

class AccessMode(str, Enum):
    NORMAL = "NORMAL"
    EMERGENCY = "EMERGENCY"

class AccessContext(str, Enum):
    NORMAL = "NORMAL"
    EMERGENCY_CONTEXT = "EMERGENCY_CONTEXT"
