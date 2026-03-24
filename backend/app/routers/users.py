from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User
from app.schemas import UserProfileResponse, UpdateUserProfileRequest

router = APIRouter()

@router.get("/me/profile", response_model=UserProfileResponse)
def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current authenticated user's profile identity.
    """
    # Simply return the user object, Pydantic handles the filtering via response_model
    return current_user

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
