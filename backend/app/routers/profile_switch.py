from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_actor_user_id, get_current_user
from ..database import get_db
from ..models import User
from .family import FamilyAccessLink, get_outgoing_links

router = APIRouter(prefix="/profiles", tags=["Profiles"])


@router.get("/")
def get_profiles(db: Session = Depends(get_db), user=Depends(get_current_user)):
    actor_user_id = get_actor_user_id(user)
    actor_user = db.query(User).filter(User.id == actor_user_id).first()

    profiles = [
        {
            "id": user.id,
            "switch_target_id": user.id,
            "name": (user.display_name or user.email),
            "email": user.email,
            "relationship": "self",
            "profile_mode": "self",
            "is_active": True,
        }
    ]

    if actor_user_id != user.id and actor_user:
        profiles.append(
            {
                "id": actor_user.id,
                "switch_target_id": actor_user.id,
                "name": actor_user.display_name or actor_user.email,
                "email": actor_user.email,
                "relationship": "return",
                "profile_mode": "return",
                "is_active": False,
            }
        )

    for link in get_outgoing_links(db, user):
        target_user = db.query(User).filter(User.id == link.target_user_id).first()
        if not target_user or target_user.id == user.id:
            continue
        profiles.append(
            {
                "id": link.id,
                "switch_target_id": target_user.id,
                "name": target_user.display_name or link.member_name,
                "email": target_user.email,
                "relationship": link.relationship,
                "profile_mode": "linked",
                "is_active": False,
            }
        )

    return {"success": True, "data": profiles, "error": None}


@router.post("/switch/{target_user_id}")
def switch_profile(
    target_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        actor_user_id = get_actor_user_id(current_user)

        if target_user_id == actor_user_id:
            actor_user = db.query(User).filter(User.id == actor_user_id, User.role == "patient").first()
            if not actor_user:
                return {"success": False, "error": "Profile not found"}
            token = create_access_token(
                {"sub": str(actor_user.id), "role": actor_user.role, "actor_user_id": str(actor_user.id)},
                timedelta(minutes=60)
            )
            return {"success": True, "data": {"access_token": token}, "error": None}

        link = db.query(FamilyAccessLink).filter(
            FamilyAccessLink.owner_user_id == current_user.id,
            FamilyAccessLink.target_user_id == target_user_id,
            FamilyAccessLink.status == "active"
        ).first()
        if not link:
            return {"success": False, "error": "Profile not found"}

        target_user = db.query(User).filter(User.id == target_user_id, User.role == "patient").first()
        if not target_user:
            return {"success": False, "error": "Profile not found"}

        token = create_access_token(
            {
                "sub": str(target_user.id),
                "role": target_user.role,
                "actor_user_id": str(actor_user_id),
                "family_link_id": str(link.id),
                "switch_mode": "family",
            },
            timedelta(minutes=60)
        )
        return {"success": True, "data": {"access_token": token}, "error": None}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
