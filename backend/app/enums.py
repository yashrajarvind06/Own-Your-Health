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

class AccessContext(str, Enum):
    NORMAL = "NORMAL"


# docx: every access request must state one of these purposes
ACCESS_PURPOSES = ("TREATMENT", "SECOND_OPINION", "EMERGENCY", "INSURANCE")
_LEGACY_PURPOSES = {"FOLLOW_UP": "TREATMENT", "DIAGNOSTIC": "TREATMENT", "MEDICATION": "TREATMENT",
                    "PROCEDURE": "TREATMENT", "OTHER": "TREATMENT", "EMERGENCY_EVAL": "EMERGENCY"}


def normalize_purpose(code: str | None) -> str:
    code = (code or "").strip().upper()
    code = _LEGACY_PURPOSES.get(code, code)
    if code not in ACCESS_PURPOSES:
        raise ValueError(f"Access purpose must be one of: {', '.join(ACCESS_PURPOSES)}")
    return code
