from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import User
from app.auth import get_current_user
from app.database import get_db
from app.services.registry import REGISTRY_BY_ROLE


def require_role(*allowed: str):
    def role_guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail=f"Forbidden: User role '{user.role}' does not match required role '{'/'.join(allowed)}'")
        # Doctors and labs act on patient data only after a registry (HPR/HFR) match
        if user.role in REGISTRY_BY_ROLE and not user.verified_at:
            raise HTTPException(status_code=403, detail="Registry verification required. Link your HPR/HFR ID first.")
        return user
    return role_guard
