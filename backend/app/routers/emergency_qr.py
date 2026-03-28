import io
import os
from html import escape
from typing import Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_role
from app.models import EmergencyQRProfile, User

router = APIRouter()


class EmergencyQRSaveRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    date_of_birth: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    chronic_conditions: Optional[str] = None
    medications: Optional[str] = None
    surgeries: Optional[str] = None
    allergies: Optional[str] = None
    organ_donor_status: Optional[str] = None
    organ_donor_details: Optional[str] = None
    pregnancy_status: Optional[str] = None


def _ecard_url(patient_id: int) -> str:
    base = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
    return f"{base}/api/emergency-qr/card/{patient_id}"


@router.post("/save")
def save_emergency_qr_profile(
    payload: EmergencyQRSaveRequest,
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db),
):
    profile = db.query(EmergencyQRProfile).filter(
        EmergencyQRProfile.patient_id == user.id
    ).first()

    if not profile:
        profile = EmergencyQRProfile(patient_id=user.id)
        db.add(profile)

    profile.name = payload.name
    profile.phone = payload.phone
    profile.emergency_contact = payload.emergency_contact
    profile.date_of_birth = payload.date_of_birth
    profile.age = payload.age
    profile.gender = payload.gender
    profile.blood_group = payload.blood_group
    profile.chronic_conditions = payload.chronic_conditions
    profile.medications = payload.medications
    profile.surgeries = payload.surgeries
    profile.allergies = payload.allergies
    profile.organ_donor_status = payload.organ_donor_status
    profile.organ_donor_details = payload.organ_donor_details
    profile.pregnancy_status = payload.pregnancy_status

    db.commit()
    db.refresh(profile)
    return {"patient_id": user.id, "message": "Saved successfully"}


@router.get("/me")
def get_my_qr_profile(
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db),
):
    profile = db.query(EmergencyQRProfile).filter(
        EmergencyQRProfile.patient_id == user.id
    ).first()

    if not profile:
        return {"exists": False}

    return {
        "exists": True,
        "patient_id": user.id,
        "name": profile.name,
        "phone": profile.phone,
        "emergency_contact": profile.emergency_contact,
        "date_of_birth": profile.date_of_birth,
        "age": profile.age,
        "gender": profile.gender,
        "blood_group": profile.blood_group,
        "chronic_conditions": profile.chronic_conditions,
        "medications": profile.medications,
        "surgeries": profile.surgeries,
        "allergies": profile.allergies,
        "organ_donor_status": profile.organ_donor_status,
        "organ_donor_details": profile.organ_donor_details,
        "pregnancy_status": profile.pregnancy_status,
    }


@router.get("/card/{patient_id}", response_class=HTMLResponse)
def get_ecard(patient_id: int, db: Session = Depends(get_db)):
    profile = db.query(EmergencyQRProfile).filter(
        EmergencyQRProfile.patient_id == patient_id
    ).first()

    if not profile:
        return HTMLResponse(content=_ecard_not_found_html(), status_code=404)

    return HTMLResponse(content=_build_ecard_html(profile), status_code=200)


@router.get("/qr/{patient_id}")
def get_qr(patient_id: int, db: Session = Depends(get_db)):
    profile = db.query(EmergencyQRProfile).filter(
        EmergencyQRProfile.patient_id == patient_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Emergency profile not found. Save it first.")

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(_ecard_url(patient_id))
    qr.make(fit=True)
    img = qr.make_image(fill_color="#8b1e1e", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


def _safe(value: Optional[str]) -> str:
    return escape(value.strip()) if value and value.strip() else ""


def _row(label: str, value: Optional[str]) -> str:
    shown = _safe(value)
    if not shown:
        shown = "<span style='color:#94a3b8;font-style:italic;'>Not specified</span>"
    return f"""
    <div class="row">
      <div class="label">{label}</div>
      <div class="value">{shown}</div>
    </div>
    """


def _build_ecard_html(profile: EmergencyQRProfile) -> str:
    name = _safe(profile.name) or "Unknown Patient"
    phone = _safe(profile.phone) or "N/A"
    donor = "Yes" if (profile.organ_donor_status or "").lower() == "yes" else "No"
    if donor == "Yes" and _safe(profile.organ_donor_details):
        donor = f"Yes - {_safe(profile.organ_donor_details)}"

    demographics = "".join(
        [
            _row("Date of Birth", profile.date_of_birth),
            _row("Age", str(profile.age) if profile.age is not None else None),
            _row("Gender", profile.gender),
            _row(
                "Pregnancy Status",
                profile.pregnancy_status if (profile.gender or "").lower() == "female" else None,
            ),
        ]
    )

    summary = "".join(
        [
            _row("Blood Group", profile.blood_group),
            _row("Emergency Contact", profile.emergency_contact),
            _row("Current Medications", profile.medications),
            _row("Chronic Conditions", profile.chronic_conditions),
            _row("Past Surgeries", profile.surgeries),
            _row("Allergies", profile.allergies),
            _row("Organ Donor", donor),
        ]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Emergency Health Card - {name}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      font-family: 'Segoe UI', sans-serif;
      background:
        radial-gradient(circle at top left, rgba(253, 186, 116, .28), transparent 26%),
        radial-gradient(circle at top right, rgba(248, 113, 113, .22), transparent 22%),
        linear-gradient(180deg, #fff7ed 0%, #fff 62%);
      color: #111827;
      padding: 18px;
    }}
    .card {{
      max-width: 640px;
      margin: 0 auto;
      background: rgba(255,255,255,.95);
      border: 1px solid rgba(251, 146, 60, .18);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 28px 60px rgba(127, 29, 29, .16);
    }}
    .hero {{
      padding: 28px;
      color: white;
      background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 48%, #ea580c 100%);
      position: relative;
    }}
    .hero::after {{
      content: "";
      position: absolute;
      right: -40px;
      bottom: -70px;
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, rgba(255,255,255,.15), transparent 65%);
    }}
    .tag {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.14);
      border: 1px solid rgba(255,255,255,.18);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }}
    .pulse {{
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #fde68a;
      box-shadow: 0 0 0 0 rgba(253,230,138,.8);
      animation: pulse 1.6s infinite;
    }}
    @keyframes pulse {{
      0% {{ box-shadow: 0 0 0 0 rgba(253,230,138,.8); }}
      70% {{ box-shadow: 0 0 0 12px rgba(253,230,138,0); }}
      100% {{ box-shadow: 0 0 0 0 rgba(253,230,138,0); }}
    }}
    .title {{
      margin: 18px 0 6px;
      font-size: 34px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -.8px;
      max-width: 80%;
    }}
    .hero-meta {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.16);
      font-size: 13px;
      font-weight: 600;
    }}
    .body {{ padding: 24px; }}
    .hero-grid {{
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 16px;
      margin-bottom: 16px;
    }}
    .panel {{
      border-radius: 20px;
      padding: 18px;
      border: 1px solid #fed7aa;
      background: linear-gradient(180deg, #fff, #fffaf5);
    }}
    .priority {{
      background: linear-gradient(180deg, #7f1d1d, #991b1b);
      border: none;
      color: white;
    }}
    .eyebrow {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
      opacity: .8;
    }}
    .critical {{
      margin-top: 12px;
      font-size: 40px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -1px;
    }}
    .subtle {{
      margin-top: 12px;
      font-size: 12px;
      line-height: 1.55;
      color: rgba(255,255,255,.82);
    }}
    .section {{
      border-radius: 20px;
      padding: 18px;
      background: white;
      border: 1px solid #fed7aa;
    }}
    .section-title {{
      color: #b45309;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 800;
      margin-bottom: 14px;
    }}
    .row {{
      padding: 12px 0;
      border-bottom: 1px solid #ffedd5;
    }}
    .row:last-child {{ border-bottom: none; }}
    .label {{
      color: #9a3412;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.4px;
      margin-bottom: 5px;
    }}
    .value {{
      color: #111827;
      font-size: 15px;
      line-height: 1.5;
      font-weight: 600;
      white-space: pre-line;
    }}
    .footer {{
      padding: 14px 24px 18px;
      text-align: center;
      color: #9ca3af;
      font-size: 11px;
      border-top: 1px solid #ffedd5;
      background: #fffaf5;
    }}
    @media (max-width: 640px) {{
      .title {{ max-width: 100%; font-size: 28px; }}
      .hero-grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="hero">
      <div class="tag"><span class="pulse"></span>Emergency Health Card</div>
      <div class="title">{name}</div>
      <div class="hero-meta">
        <div class="pill">Phone: {phone}</div>
        <div class="pill">Emergency Contact: {_safe(profile.emergency_contact) or 'Not listed'}</div>
      </div>
    </div>
    <div class="body">
      <div class="hero-grid">
        <div class="panel priority">
          <div class="eyebrow">Primary Clinical Marker</div>
          <div class="critical">{_safe(profile.blood_group) or 'N/A'}</div>
          <div class="subtle">This card is designed for emergency triage. Verify history with the patient or emergency contact when possible.</div>
        </div>
        <div class="panel">
          <div class="section-title">Demographics</div>
          {demographics}
        </div>
      </div>
      <div class="section">
        <div class="section-title">Clinical Summary</div>
        {summary}
      </div>
    </div>
    <div class="footer">OwnYourHealth Emergency Card · The same QR always resolves to the latest saved profile</div>
  </div>
</body>
</html>"""


def _ecard_not_found_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>No Emergency Profile</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff7ed;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:420px;padding:32px;border-radius:24px;background:white;border:1px solid #fed7aa;box-shadow:0 20px 45px rgba(124,45,18,.08);text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">+</div>
    <h2 style="margin:0 0 10px;color:#9a3412;">No Emergency Profile Found</h2>
    <p style="margin:0;color:#6b7280;line-height:1.6;">This QR code does not currently point to a saved emergency e-card.</p>
  </div>
</body>
</html>"""
