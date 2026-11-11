"""Shared record logic: storing uploads, trust badges, relevance decay, one-line and profile summaries."""
import threading
import uuid
from datetime import date, datetime, timedelta
from hashlib import sha256
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.blockchain import store_hash_on_chain
from app.models import AuditLog, EmergencyQRProfile, MedicalReport, PatientProfile, User
from app.services.file_urls import file_url, get_s3
from app.services.report_extraction import extract_report_data

# docx: Mandatory upload inputs + relevance periods (None = lifetime)
RELEVANCE_DAYS = {
    "OPD Visit Notes": 365,
    "Prescription": 180,
    "Lab Report": 365,
    "Imaging": 730,
    "Procedure / Treatment Summary": None,
    "Discharge Summary": None,
    "Surgery": None,
    "Allergy": None,
    "Follow-up Notes": 365,
    "Other": 365,
}
RECORD_TYPES = list(RELEVANCE_DAYS)

# OCR detect_report_type() codes -> record type (docx: auto classification)
_OCR_TYPE = {"LAB": "Lab Report", "PRESCRIPTION": "Prescription", "DISCHARGE": "Discharge Summary", "XRAY": "Imaging"}

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/heic", "image/webp"}


def _record_date(r: MedicalReport) -> datetime:
    return r.report_date or r.created_at


def is_relevant(r: MedicalReport, today: date | None = None) -> bool:
    days = RELEVANCE_DAYS.get(r.record_type or "Other", 365)
    if days is None:
        return True
    return (today or date.today()) - _record_date(r).date() <= timedelta(days=days)


def trust_badge(r: MedicalReport) -> str:
    if r.reviewed_at:
        return "DOCTOR_REVIEWED"
    return {"DOCTOR": "DOCTOR_VERIFIED", "LAB": "LAB_VERIFIED"}.get(r.uploaded_by, "UNVERIFIED")


def vital_flags(r: MedicalReport) -> list[str]:
    """Observational labels on extracted values. Not a diagnosis."""
    out = []
    if r.bp_systolic and r.bp_diastolic:
        tag = " (high)" if r.bp_systolic >= 140 or r.bp_diastolic >= 90 else " (low)" if r.bp_systolic < 90 else ""
        out.append(f"BP {r.bp_systolic}/{r.bp_diastolic}{tag}")
    if r.glucose:
        tag = " (high)" if r.glucose >= 140 else " (low)" if r.glucose < 70 else ""
        out.append(f"sugar {r.glucose} mg/dL{tag}")
    if r.heart_rate:
        tag = " (high)" if r.heart_rate > 100 else " (low)" if r.heart_rate < 60 else ""
        out.append(f"pulse {r.heart_rate}{tag}")
    if r.weight:
        out.append(f"weight {r.weight} kg")
    if r.temperature:
        out.append(f"temp {r.temperature}")
    return out


def one_line_summary(r: MedicalReport) -> str:
    """User-entered summary wins, then Gemini's; otherwise built from type, flagged vitals and the OCR finding."""
    if r.user_summary:
        return r.user_summary
    if r.ai_summary:
        return r.ai_summary
    parts = vital_flags(r)
    if r.summary and r.summary not in parts:
        parts.insert(0, r.summary)
    body = ", ".join(parts) if parts else "no values could be read automatically"
    return f"{r.record_type or 'Record'}: {body}"


def serialize(r: MedicalReport, with_url: bool = True) -> dict:
    return {
        "id": r.id,
        "report_id": r.report_id,
        "filename": r.filename,
        "mime_type": r.mime_type,
        "record_type": r.record_type or "Other",
        "record_date": _record_date(r).isoformat(),
        "summary": r.summary,
        "user_summary": r.user_summary,
        "one_line_summary": one_line_summary(r),
        "ai_summary": r.ai_summary,
        "ai_details": r.ai_details,
        "ai_status": r.ai_status,
        "uploaded_by": r.uploaded_by,
        "trust_badge": trust_badge(r),
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "relevant": is_relevant(r),
        "vitals": {k: getattr(r, k) for k in ("bp_systolic", "bp_diastolic", "heart_rate", "glucose", "weight", "temperature")},
        "sha256_hash": r.sha256_hash,
        "blockchain_tx": r.blockchain_tx,
        "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
        "presigned_url": file_url(r.file_key) if with_url else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def store_report(
    db: Session,
    *,
    patient_id: int,
    uploader: User,
    uploaded_by: str,
    file: UploadFile,
    record_type: str | None,
    record_date: date | None,
    summary: str | None,
    report_id: str | None = None,
    on_behalf_note: str = "",
) -> MedicalReport:
    if record_type and record_type not in RELEVANCE_DAYS:
        raise HTTPException(status_code=422, detail=f"record_type must be one of: {', '.join(RECORD_TYPES)}")
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Only PDF or image files are accepted")
    data = file.file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 15 MB")
    if summary and len(summary) > 280:
        raise HTTPException(status_code=422, detail="Summary must be 1-2 lines (280 characters max)")

    digest = sha256(data).hexdigest()
    safe_name = Path(file.filename or "upload").name
    key = f"reports/{patient_id}/{datetime.utcnow().timestamp()}_{safe_name}"
    path = Path("storage") / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)  # kept locally too: OCR reads it, and it is the backup copy
    s3, bucket = get_s3()
    if s3:
        s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=file.content_type)

    report_id = (report_id or "").strip() or f"REC-{uuid.uuid4().hex[:8].upper()}"
    rec = MedicalReport(
        patient_id=patient_id,
        filename=safe_name,
        mime_type=file.content_type,
        file_key=key,
        sha256_hash=digest,
        report_id=report_id,
        blockchain_tx=store_hash_on_chain(digest, report_id) or "",
        user_summary=(summary or "").strip() or None,
        uploaded_by=uploaded_by,
        uploaded_by_user_id=uploader.id,
        record_type=record_type,  # None = detect from the document, filled in by process_new_report
        report_date=datetime.combine(record_date, datetime.min.time()) if record_date else None,
    )
    db.add(rec)
    db.add(AuditLog(actor_user_id=uploader.id, patient_id=patient_id,
                    details=f"Action: upload_report, ID: {report_id}, By: {uploaded_by}{on_behalf_note}"))
    db.commit()
    db.refresh(rec)
    return rec


def _age(dob: str | None, fallback: int | None) -> int | None:
    try:
        born = datetime.strptime(dob, "%Y-%m-%d").date()
        today = date.today()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except (TypeError, ValueError):
        return fallback


def _split(text: str | None) -> list[str]:
    return [x.strip() for x in (text or "").replace("\n", ",").split(",") if x.strip()]


def patient_summary(db: Session, patient: User) -> dict:
    """docx 'Patient Snapshot': age, conditions, medications, allergies, recent tests, last visit."""
    ep = db.query(EmergencyQRProfile).filter(EmergencyQRProfile.patient_id == patient.id).first()
    pp = db.query(PatientProfile).filter(PatientProfile.user_id == patient.id).first()
    reports = (
        db.query(MedicalReport)
        .filter(MedicalReport.patient_id == patient.id, MedicalReport.deleted_at.is_(None))
        .all()
    )
    reports.sort(key=_record_date, reverse=True)

    conditions = _split(ep.chronic_conditions if ep else None) or _split(pp.chronic_diseases if pp else None)
    meds = _split(ep.medications if ep else None) or _split(pp.medications if pp else None)
    allergies = _split(ep.allergies if ep else None) or _split(pp.allergies if pp else None)
    tests = [r for r in reports if r.record_type in ("Lab Report", "Imaging")][:3]
    visits = [r for r in reports if r.record_type in ("OPD Visit Notes", "Follow-up Notes", "Discharge Summary", "Procedure / Treatment Summary", "Surgery")]
    latest_vitals = next((vital_flags(r) for r in reports if vital_flags(r)), [])
    age = _age(ep.date_of_birth if ep else None, ep.age if ep else None)

    last_visit = None
    if visits:
        days = (date.today() - _record_date(visits[0]).date()).days
        last_visit = {"date": _record_date(visits[0]).date().isoformat(), "days_ago": days, "type": visits[0].record_type}

    snapshot = {
        "patient_id": patient.id,
        "name": (ep.name if ep and ep.name else None) or patient.display_name,
        "age": age,
        "gender": ep.gender if ep else None,
        "blood_group": (ep.blood_group if ep else None) or (pp.blood_group if pp else None),
        "abha_number": patient.abha_number,
        "chronic_conditions": conditions,
        "current_medications": meds,
        "allergies": allergies,
        "recent_tests": [{"id": r.id, "date": _record_date(r).date().isoformat(), "summary": one_line_summary(r)} for r in tests],
        "latest_vitals": latest_vitals,
        "last_visit": last_visit,
        "record_counts": {t: sum(1 for r in reports if (r.record_type or "Other") == t) for t in RECORD_TYPES if any((r.record_type or "Other") == t for r in reports)},
        "verified_record_count": sum(1 for r in reports if trust_badge(r) != "UNVERIFIED"),
        "total_records": len(reports),
    }
    bits = [b for b in [
        f"{snapshot['name'] or 'Patient'}" + (f", {age}" if age is not None else ""),
        f"conditions: {', '.join(conditions)}" if conditions else None,
        f"on {', '.join(meds)}" if meds else None,
        f"allergic to {', '.join(allergies)}" if allergies else None,
        f"latest: {', '.join(latest_vitals)}" if latest_vitals else None,
        f"last visit {last_visit['days_ago']} days ago" if last_visit else None,
    ] if b]
    snapshot["overview"] = "; ".join(bits) + "."
    return snapshot


_VITAL_NAMES = {"bp_systolic": "BP", "glucose": "Blood sugar", "weight": "Weight", "heart_rate": "Heart rate"}


def health_insights(db: Session, patient: User) -> list[str]:
    """docx 'Simple Health Pattern Alerts': observational only, no prediction or diagnosis."""
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient.id, MedicalReport.deleted_at.is_(None)).all()
    reports.sort(key=_record_date)
    out = []
    for key, name in _VITAL_NAMES.items():
        values = [getattr(r, key) for r in reports if getattr(r, key) is not None]
        last = values[-3:]
        if len(last) == 3 and last[0] < last[1] < last[2]:
            out.append(f"{name} recorded in your last 3 reports - values increasing ({' -> '.join(map(str, last))})")
        elif len(last) == 3 and last[0] > last[1] > last[2]:
            out.append(f"{name} recorded in your last 3 reports - values decreasing ({' -> '.join(map(str, last))})")
    if not reports or (date.today() - _record_date(reports[-1]).date()).days > 365:
        out.append("No reports uploaded in the last 1 year")
    return out


REPORT_SYSTEM = (
    "You summarise ONE medical record for the patient who owns it, in plain language a non-doctor understands. "
    "Use only what the document says; never invent values. Do not diagnose. Never tell the patient to start, stop "
    "or change a medicine: 'discuss' items are short questions or follow-ups to raise with their doctor. "
    "one_liner: at most 110 characters, the single most useful fact (e.g. 'HbA1c 7.8%, above target; fasting sugar 142 mg/dL'). "
    "values: the measured results with the reference range printed on the report as target, and status "
    "normal|high|low|abnormal. If the document is unreadable or not medical, say so in one_liner and leave lists empty."
)
REPORT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "one_liner": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "values": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "name": {"type": "STRING"}, "value": {"type": "STRING"}, "unit": {"type": "STRING"},
            "target": {"type": "STRING"}, "status": {"type": "STRING", "enum": ["normal", "high", "low", "abnormal"]},
        }, "required": ["name", "value", "status"]}},
        "takeaways": {"type": "ARRAY", "items": {"type": "STRING"}},
        "discuss": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["one_liner", "summary", "values", "takeaways", "discuss"],
}


def summarize_report(db: Session, r: MedicalReport) -> MedicalReport:
    """Gemini one-liner + details for one record. Leaves the rule-based summary in place if Gemini is off or fails."""
    from app.services import ai
    if not ai.enabled():
        return r
    context = f"Record type: {r.record_type or 'unknown'}. Date: {_record_date(r).date().isoformat()}. Uploaded by: {r.uploaded_by}."
    ocr = (r.extracted_text or "")[:6000]
    out = ai.generate_json(REPORT_SYSTEM, [
        {"text": context + (f" OCR text (may be noisy): {ocr}" if ocr else "")},
        ai.file_part(str(Path("storage") / r.file_key), r.mime_type),
    ], REPORT_SCHEMA)
    if out and out.get("one_liner"):
        r.ai_summary = out["one_liner"][:300]
        r.ai_details = {k: out.get(k) for k in ("summary", "values", "takeaways", "discuss")}
        r.ai_status = "DONE"
    else:
        r.ai_status = "FAILED"
    db.commit()
    return r


def summarize_reports_bg(report_ids: list[int]) -> None:
    """Background task, one record at a time (parallel calls hit Gemini's rate limit). Own DB session."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        for report_id in report_ids:
            with _heavy:
                r = db.get(MedicalReport, report_id)
                if r and r.ai_status == "PENDING":
                    summarize_report(db, r)
    finally:
        db.close()


def queue_summaries(db: Session, background, reports: list[MedicalReport], limit: int = 5) -> None:
    """Mark records without an AI summary as PENDING and summarise them after the response (a few per request)."""
    from app.services import ai
    if not ai.enabled():
        return
    todo = [r for r in reports if r.ai_status is None and not r.deleted_at][:limit]
    for r in todo:
        r.ai_status = "PENDING"
    db.commit()
    if todo:
        background.add_task(summarize_reports_bg, [r.id for r in todo])


_heavy = threading.Lock()  # OCR and AI one upload at a time: the free server has 512 MB


def _ocr(db: Session, r: MedicalReport) -> None:
    """Read the document: text, vitals, and the type/date when the uploader didn't give them."""
    try:
        ocr = extract_report_data(str(Path("storage") / r.file_key), r.mime_type)
    except Exception as e:  # extraction is optional (docx): keep the document even if OCR fails
        print(f"OCR failed for report {r.id}: {type(e).__name__}")
        ocr = {"raw_text": "", "summary": None}
    r.extracted_text, r.summary = ocr["raw_text"], ocr["summary"]
    r.record_type = r.record_type or _OCR_TYPE.get(ocr.get("report_type"), "Other")
    r.report_date = r.report_date or ocr.get("report_date")
    for k in ("bp_systolic", "bp_diastolic", "heart_rate", "glucose", "weight", "temperature"):
        setattr(r, k, ocr.get(k))
    db.commit()


def process_new_report(report_id: int) -> None:
    """Background task after an upload: OCR, then the AI summary. Own DB session."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        with _heavy:
            r = db.get(MedicalReport, report_id)
            if not r:
                return
            _ocr(db, r)
            if r.ai_status == "PENDING":
                summarize_report(db, r)
    finally:
        db.close()


def start_processing(db: Session, background, rec: MedicalReport) -> None:
    """Called by the upload endpoints: reply now, read the document after the response."""
    from app.services import ai
    if ai.enabled():
        rec.ai_status = "PENDING"
        db.commit()
    background.add_task(process_new_report, rec.id)
