from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import User, PatientProfile
from ..schemas import RegisterRequest, LoginRequest, TokenResponse, PatientProfileUpdate, PatientProfileResponse, UserResponse
from ..auth import get_password_hash, verify_password, create_access_token, get_current_user
from ..services.registry import REGISTRY_BY_ROLE, verify_user
import secrets
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from ..services.otp import check_otp, normalize_phone, send_otp
from ..services.registry import abha_lookup, normalize_abha

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email, 
        hashed_password=get_password_hash(body.password), 
        role=body.role,
        display_name=body.display_name
    )
    if body.role in REGISTRY_BY_ROLE:
        verify_user(db, user, body.registry_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    if body.role == "patient":
        profile = PatientProfile(user_id=user.id)
        db.add(profile)
        db.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=user.id)

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Standard JSON login endpoint.
    NOTE: Swagger UI's 'Authorize' button sends form-data, which will fail here with 422.
    Please use 'curl' or Postman with JSON body to test this endpoint.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=user.id)

@router.get("/me/profile", response_model=PatientProfileResponse)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Forbidden")
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if not profile:
        profile = PatientProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return PatientProfileResponse(
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        chronic_diseases=profile.chronic_diseases,
        medications=profile.medications,
        emergency_contact=profile.emergency_contact,
        past_surgeries=profile.past_surgeries,
    )

@router.put("/me/profile", response_model=PatientProfileResponse)
def update_profile(body: PatientProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Forbidden")
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if not profile:
        profile = PatientProfile(user_id=user.id)
        db.add(profile)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return PatientProfileResponse(
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        chronic_diseases=profile.chronic_diseases,
        medications=profile.medications,
        emergency_contact=profile.emergency_contact,
        past_surgeries=profile.past_surgeries,
    )

@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return UserResponse(id=user.id, email=user.email, role=user.role)


class OtpRequest(BaseModel):
    phone: Optional[str] = None
    abha_number: Optional[str] = None


class OtpVerify(OtpRequest):
    code: str
    display_name: Optional[str] = None


def _otp_target(body: OtpRequest) -> tuple[str, dict | None]:
    """ABHA login sends the OTP to the mobile registered with ABHA; otherwise to the given phone."""
    if body.abha_number:
        abha = abha_lookup(body.abha_number)
        if not abha:
            raise HTTPException(status_code=404, detail="ABHA number not found")
        return normalize_phone(abha["mobile"]), abha
    return normalize_phone(body.phone), None


@router.post("/otp/request")
def otp_request(body: OtpRequest, db: Session = Depends(get_db)):
    phone, _ = _otp_target(body)
    return send_otp(db, phone, "LOGIN")


@router.post("/otp/verify", response_model=TokenResponse)
def otp_verify(body: OtpVerify, db: Session = Depends(get_db)):
    """Patient login by ABHA (verified identity) or mobile OTP (fallback). Creates the account on first login."""
    phone, abha = _otp_target(body)
    check_otp(db, phone, "LOGIN", body.code)
    abha_number = normalize_abha(body.abha_number) if abha else None

    user = (abha_number and db.query(User).filter(User.abha_number == abha_number).first()) \
        or db.query(User).filter(User.phone == phone).first()
    if user and user.role != "patient":
        raise HTTPException(status_code=403, detail="OTP login is for patients only")
    if not user:
        user = User(
            email=f"patient.{phone}@users.ownyourhealth.in",  # placeholder: OTP accounts have no email
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            role="patient",
            display_name=(abha or {}).get("name") or (body.display_name or "").strip() or None,
        )
        db.add(user)
        db.flush()
        db.add(PatientProfile(user_id=user.id))
    user.phone = user.phone or phone
    user.phone_verified_at = user.phone_verified_at or datetime.utcnow()
    if abha:
        user.abha_number, user.abha_address, user.abha_verified_at = abha_number, abha["abha_address"], datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=user.id)
