from app.config import SECRET_KEY
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
import jwt

from app.models import QRToken
from app.services.audit_service import AuditService

QR_TOKEN_DURATION = timedelta(minutes=10)


class QRService:
    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def generate_qr_token(self, user_id: int) -> str:
        exp_utc = datetime.now(timezone.utc) + QR_TOKEN_DURATION

        payload = {
            "user_id": user_id,
            "exp": int(exp_utc.timestamp())
        }

        token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

        if user_id is None:
            print("CRITICAL ERROR: user_id is None in generate_qr_token")
            raise ValueError("Cannot generate QR token: User ID is missing")

        # ensure patient_id is set to satisfy not-null constraint
        print(f"DEBUG: Inserting QRToken with patient_id={user_id}")
        qr_token = QRToken(token=token, patient_id=user_id, expires_at=exp_utc)
        self.db.add(qr_token)
        self.db.commit()

        self.audit_service.append_event(
            event_type="QR_GENERATED",
            actor_id=user_id,
            actor_role="patient",
            patient_id=user_id,
            doctor_id=None,
            report_id=None,
            access_mode="qr"
        )

        return token

    def validate_qr_token(self, token: str, scanner_id: int | None = None, scanner_role: str | None = None) -> int | None:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id = payload["user_id"]

            qr_token = self.db.query(QRToken).filter(QRToken.token == token).first()
            if not qr_token:
                self._log_qr_rejected(scanner_id or user_id)
                return None

            # If scanner is provided (Doctor), log as Doctor. Else log as Patient (self-check).
            actor_id = scanner_id if scanner_id else user_id
            role = scanner_role if scanner_role else "patient"

            self.audit_service.append_event(
                event_type="QR_VALIDATED",
                actor_id=actor_id,
                actor_role=role,
                patient_id=user_id,
                doctor_id=scanner_id if role == "doctor" else None,
                report_id=None,
                access_mode="qr"
            )

            return user_id

        except jwt.ExpiredSignatureError:
            self._log_qr_rejected(None)
            return None

        except jwt.InvalidTokenError:
            self._log_qr_rejected(None)
            return None

    def revoke_qr_token(self, token: str):
        qr_token = self.db.query(QRToken).filter(QRToken.token == token).first()
        if not qr_token:
            raise ValueError("QR token not found")

        self.db.delete(qr_token)
        self.db.commit()

    def get_qr_token_with_ist_expiry(self, token: str) -> dict:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        exp_utc = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

        return {
            "expiry_utc": exp_utc.isoformat(),
            "expiry_seconds_remaining": int((exp_utc - datetime.now(timezone.utc)).total_seconds())
        }

    def _log_qr_rejected(self, user_id: int | None):
        self.audit_service.append_event(
            event_type="QR_REJECTED",
            actor_id=user_id or -1,
            actor_role="patient",
            patient_id=user_id or -1,
            doctor_id=None,
            report_id=None,
            access_mode="qr"
        )
