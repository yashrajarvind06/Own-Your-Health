from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models import QRToken, User
from app.services.qr_service import QRService
from app.deps import require_role, get_db


router = APIRouter()

@router.post("/generate")
def generate_qr_token(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    print(f"DEBUG: generate_qr_token called for user {user.id}")
    qr_service = QRService(db)
    token = qr_service.generate_qr_token(user.id)
    return {"token": token}

@router.get("/active")
def get_active_qr(token: str, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    qr_service = QRService(db)
    # validate_qr_token returns int | None now
    if qr_service.validate_qr_token(token) is None:
        raise HTTPException(status_code=403, detail="Invalid or expired QR token")
    return {"message": "QR token is valid"}

class ValidateQRRequest(BaseModel):
    token: str

@router.post("/validate")
def validate_qr(req: ValidateQRRequest, user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    qr_service = QRService(db)
    patient_id = qr_service.validate_qr_token(req.token, scanner_id=user.id, scanner_role=user.role)
    
    if patient_id is None:
        raise HTTPException(status_code=403, detail="QR expired or invalid")
        
    return {"valid": True, "patient_id": patient_id}

@router.get("/expiry")
def get_qr_expiry(token: str, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    qr_service = QRService(db)
    # Reuse existing service method which returns exactly what we need
    # (expiry_utc, expiry_seconds_remaining)
    # effectively aliasing /token-details but with explicit /expiry path as requested
    details = qr_service.get_qr_token_with_ist_expiry(token)
    if "error" in details:
        raise HTTPException(status_code=403, detail=details["error"])
    return details
