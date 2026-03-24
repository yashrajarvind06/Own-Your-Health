from pydantic import BaseModel, EmailStr
from typing import Optional, Literal, List
from datetime import datetime

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    role: Literal["patient", "doctor", "lab"]

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Literal["patient", "doctor", "lab"]
    user_id: int

class PatientProfileUpdate(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    medications: Optional[str] = None
    emergency_contact: Optional[str] = None
    past_surgeries: Optional[str] = None

class PatientProfileResponse(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    medications: Optional[str] = None
    emergency_contact: Optional[str] = None
    past_surgeries: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: Literal["patient", "doctor", "lab"]

class UserProfileResponse(BaseModel):
    id: int
    display_name: Optional[str]
    email: EmailStr
    role: str

class UpdateUserProfileRequest(BaseModel):
    display_name: str

class EmergencyContact(BaseModel):
    name: str
    phone: str
    relation: Optional[str] = None

class EmergencyProfileBase(BaseModel):
    blood_group: str
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    past_surgeries: Optional[str] = None
    emergency_contacts: list[EmergencyContact]

class EmergencyProfileCreate(EmergencyProfileBase):
    pass

class EmergencyProfileUpdate(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    past_surgeries: Optional[str] = None
    emergency_contacts: Optional[list[EmergencyContact]] = None

class EmergencyProfileResponse(EmergencyProfileBase):
    updated_at: datetime

    class Config:
        from_attributes = True
