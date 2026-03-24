from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import User
from app.auth import get_current_user
from app.database import get_db


def require_role(required: str):
    def role_guard(user: User = Depends(get_current_user)) -> User:
        if user.role != required:
            raise HTTPException(status_code=403, detail=f"Forbidden: User role '{user.role}' does not match required role '{required}'")
        return user
    return role_guard
