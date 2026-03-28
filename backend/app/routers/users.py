from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User
from app.schemas import UserProfileResponse, UpdateUserProfileRequest
from app.services.doctor_directory import get_doctor_profile, verify_doctor

router = APIRouter()

@router.get("/me/profile", response_model=UserProfileResponse)
def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current authenticated user's profile identity.
    """
    verified = False
    hpr_id = None
    if current_user.role == "doctor":
        profile = get_doctor_profile(current_user.id)
        hpr_id = profile["hpr_id"]
        verified = verify_doctor(hpr_id)

    return {
        "id": current_user.id,
        "name": current_user.display_name,
        "display_name": current_user.display_name,
        "email": current_user.email,
        "role": current_user.role,
        "verified": verified,
        "hpr_id": hpr_id,
    }

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
