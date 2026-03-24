from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import secrets
import hashlib

from app.database import get_db
from app.models import User, EmergencyToken
from app.deps import require_role

router = APIRouter()

@router.post("/generate")
def generate_emergency_token(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    try:
        # Step 6: Ensure Single Active Token
        active_tokens = db.query(EmergencyToken).filter(
            EmergencyToken.patient_id == user.id,
            EmergencyToken.is_active == True
        ).all()
        
        for token in active_tokens:
            token.is_active = False
            
        # Step 4: Token Generation
        raw_token = secrets.token_urlsafe(32)
        
        # Step 5: Hash Token
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        
        # Step 7: Store Token
        new_token = EmergencyToken(
            patient_id=user.id,
            token_hash=token_hash,
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(new_token)
        db.commit()
        
        # Step 8: Response
        return {"token": raw_token}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database failure while generating emergency token")

from fastapi import Path, Request
from app.models import PatientProfile, EmergencyAccessLog
from datetime import timedelta
from sqlalchemy import desc

@router.post("/revoke")
def revoke_emergency_token(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    token = db.query(EmergencyToken).filter(
        EmergencyToken.patient_id == user.id,
        EmergencyToken.is_active == True
    ).first()
    
    if not token:
        raise HTTPException(status_code=404, detail="No active emergency token found")
        
    token.is_active = False
    db.commit()
    return {"message": "Emergency access revoked successfully"}

@router.get("/history")
def get_emergency_history(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db)
):
    logs = db.query(EmergencyAccessLog).join(EmergencyToken).filter(
        EmergencyToken.patient_id == user.id
    ).order_by(desc(EmergencyAccessLog.scanned_at)).limit(50).all()
    
    return [
        {
            "scanned_at": log.scanned_at.isoformat() + "Z" if log.scanned_at else None,
            "ip_address": log.ip_address,
            "device": log.device_type,
            "location": log.approx_location
        }
        for log in logs
    ]

@router.get("/{token}")
def get_emergency_data(
    request: Request,
    token: str = Path(...),
    db: Session = Depends(get_db)
):
    try:
        # Step 1: Hash Incoming Token
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Step 2: Fetch Token from DB
        emergency_token = db.query(EmergencyToken).filter(
            EmergencyToken.token_hash == token_hash,
            EmergencyToken.is_active == True
        ).first()
        
        if not emergency_token:
            raise HTTPException(status_code=404, detail="Invalid token")
            
        # Step 3: Check Expiry
        if emergency_token.expires_at and emergency_token.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail="Emergency token expired")

        # Step 4: Rate Limiting
        now = datetime.now(timezone.utc)
        count = db.query(EmergencyAccessLog).filter(
            EmergencyAccessLog.token_id == emergency_token.id,
            EmergencyAccessLog.scanned_at >= now - timedelta(seconds=60)
        ).count()

        if count >= 3:
            return {"error": "Too many requests. Try again later."}

        # Step 5: Fetch patient data
        profile = db.query(PatientProfile).filter(PatientProfile.user_id == emergency_token.patient_id).first()
        
        # Step 6: Create Log Entry
        ip_addr = request.client.host if request.client else "Unknown"
        user_agent = request.headers.get("user-agent", "Unknown")
        
        access_log = EmergencyAccessLog(
            token_id=emergency_token.id,
            ip_address=ip_addr,
            device_type=user_agent,
            approx_location="Unknown"
        )
        db.add(access_log)
        db.commit()

        # Step 7: Alert Trigger
        print(f"[ALERT] Emergency QR accessed for patient {emergency_token.patient_id}")
        print(f"   Timestamp: {datetime.now(timezone.utc)}")
        print(f"   IP: {ip_addr} | Device: {user_agent}")

        # Step 8: Clean Response Guarantee
        def parse_text_to_list(text_data):
            if not text_data:
                return []
            return [item.strip() for item in text_data.split(",") if item.strip()]
            
        parsed_allergies = parse_text_to_list(profile.allergies) if profile else []
        parsed_conditions = parse_text_to_list(profile.chronic_diseases) if profile else []
        parsed_contacts = parse_text_to_list(profile.emergency_contact) if profile else []

        return {
            "blood_group": profile.blood_group if profile else None,
            "allergies": parsed_allergies or [],
            "conditions": parsed_conditions or [],
            "emergency_contacts": parsed_contacts or []
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database failure")
