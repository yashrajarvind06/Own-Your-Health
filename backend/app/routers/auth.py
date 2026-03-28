from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import User, PatientProfile
from ..schemas import RegisterRequest, LoginRequest, TokenResponse, PatientProfileUpdate, PatientProfileResponse, UserResponse
from ..auth import get_password_hash, verify_password, create_access_token, get_current_user
from datetime import timedelta

router = APIRouter()


def normalize_email(email: str) -> str:
    return email.strip().lower()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    normalized_email = normalize_email(body.email)
    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=normalized_email,
        hashed_password=get_password_hash(body.password), 
        role=body.role,
        display_name=body.display_name
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if body.role == "patient":
        profile = PatientProfile(user_id=user.id)
        db.add(profile)
        db.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role}, timedelta(minutes=60))
    return TokenResponse(access_token=token, role=user.role, user_id=user.id)

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Standard JSON login endpoint.
    NOTE: Swagger UI's 'Authorize' button sends form-data, which will fail here with 422.
    Please use 'curl' or Postman with JSON body to test this endpoint.
    """
    normalized_email = normalize_email(body.email)
    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role}, timedelta(minutes=60))
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
