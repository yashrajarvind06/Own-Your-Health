import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User
from .config import SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# NOTE: Swagger UI sends form-data by default for OAuth2, but our /auth/login endpoint expects JSON.
# This causes Swagger 'Authorize' button to fail with 422 Unprocessable Entity.
# This is a known limitation for this hackathon setup. Please use the API manually or via proper frontend.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", description="Swagger login may fail (422) due to JSON/Form mismatch. Use manual token.")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")


def get_active_profile_user_id(user: User) -> int:
    return user.id


def get_actor_user_id(user: User) -> int:
    return getattr(user, "_actor_user_id", user.id)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload.get("sub"))
    except Exception as e:
        print(f"AUTH DEBUG: Token validation failed: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {str(e)}")

    active_user = db.query(User).filter(User.id == user_id).first()
    if not active_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    actor_user_id = payload.get("actor_user_id")
    if actor_user_id is None:
        actor_user_id = user_id
    try:
        actor_user_id = int(actor_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid actor user id")

    active_user._actor_user_id = actor_user_id
    active_user._family_link_id = payload.get("family_link_id")
    active_user._switch_mode = payload.get("switch_mode", "self")

    return active_user
