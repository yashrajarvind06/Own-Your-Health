from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User
from app.schemas import UserProfileResponse, UpdateUserProfileRequest, LinkRegistryRequest
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.services.otp import DEV_ECHO, check_otp, normalize_phone, real_email, send_otp
from app.services.registry import REGISTRY_BY_ROLE, abha_lookup, lookup, normalize_abha, verify_user

router = APIRouter()

@router.get("/me/profile", response_model=UserProfileResponse)
def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current authenticated user's profile identity.
    """
    return {
        "id": current_user.id,
        "name": current_user.display_name,
        "display_name": current_user.display_name,
        "email": current_user.email,
        "role": current_user.role,
        "verified": current_user.verified_at is not None,
        "hpr_id": current_user.registry_id,
        "registry_profile": lookup(current_user.role, current_user.registry_id) if current_user.verified_at else None,
        "phone": current_user.phone,
        "phone_verified": current_user.phone_verified_at is not None,
        "abha_number": current_user.abha_number,
        "abha_address": current_user.abha_address,
        "abha_verified": current_user.abha_verified_at is not None,
        "health_alerts_enabled": current_user.health_alerts_enabled,
    }


class AbhaLinkRequest(BaseModel):
    abha_number: str
    code: Optional[str] = None


@router.post("/me/abha")
def link_abha(body: AbhaLinkRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Two calls: without `code` sends an OTP to the ABHA-registered mobile; with `code` links the ABHA."""
    if current_user.role != "patient":
        raise HTTPException(status_code=400, detail="Only patients have ABHA")
    abha = abha_lookup(body.abha_number)
    if not abha:
        raise HTTPException(status_code=404, detail="ABHA number not found")
    phone = normalize_phone(abha["mobile"])
    if not body.code:
        # shortcut: mock ABHA registry with no SMS, so the code goes to the signed-in user's email and doesn't prove
        # they hold the ABHA's mobile; send it to that mobile once a real ABHA/SMS gateway is connected.
        return send_otp(db, phone, "ABHA_LINK", email=real_email(current_user))
    check_otp(db, phone, "ABHA_LINK", body.code)
    number = normalize_abha(body.abha_number)
    if db.query(User).filter(User.abha_number == number, User.id != current_user.id).first():
        raise HTTPException(status_code=409, detail="This ABHA is already linked to another account")
    current_user.abha_number, current_user.abha_address, current_user.abha_verified_at = number, abha["abha_address"], datetime.utcnow()
    if not current_user.phone and not db.query(User).filter(User.phone == phone).first():
        current_user.phone, current_user.phone_verified_at = phone, datetime.utcnow() if DEV_ECHO else None
    db.commit()
    return {"abha_number": number, "abha_address": abha["abha_address"], "abha_verified": True}


class SettingsBody(BaseModel):
    health_alerts_enabled: bool


@router.put("/me/settings")
def update_settings(body: SettingsBody, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.health_alerts_enabled = body.health_alerts_enabled
    db.commit()
    return {"health_alerts_enabled": current_user.health_alerts_enabled}


@router.put("/me/registry-id")
def link_registry_id(
    body: LinkRegistryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify an existing doctor/lab account against HPR/HFR (one-time)."""
    if current_user.role not in REGISTRY_BY_ROLE:
        raise HTTPException(status_code=400, detail="Only doctors and labs have registry IDs")
    verify_user(db, current_user, body.registry_id)
    db.commit()
    return {"verified": True, "registry_id": current_user.registry_id}

@router.put("/me/display-name")
def update_display_name(
    body: UpdateUserProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the current authenticated user's display name.
    """
    new_name = body.display_name.strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="Display name cannot be empty")
    
    if len(new_name) > 100:
        raise HTTPException(status_code=400, detail="Display name exceeds 100 characters")

    # Temporary Debug Log as requested
    print(f"DEBUG: Updated display_name for user_id={current_user.id} from '{current_user.display_name}' to '{new_name}'")

    current_user.display_name = new_name
    db.commit()
    
    return {"message": "Display name updated successfully"}
