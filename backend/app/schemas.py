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


