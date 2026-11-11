from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.deps import get_db, require_role
from app.models import ActiveAccessSession, AuditLog, MedicalReport, ReportAccess, ReportAccessRequest, ReportComment, User
from app.services.access_service import AccessService
from app.services.family import acting_patient, log_on_behalf
from app.services.file_urls import file_url
from app.services.log_service import LogService
from app.services.registry import normalize_abha
from app.services.assistant import answer as assistant_answer
from app.services.records import RECORD_TYPES, health_insights, patient_summary, queue_summaries, serialize, start_processing, store_report, summarize_report
from app.services.report_access_service import ReportAccessService
from app.services.misuse import record_denied_doctor_access, record_doctor_access

router = APIRouter()
dt = datetime


def _patient_report(db: Session, patient_id: int, report_id: int) -> MedicalReport:
    r = db.query(MedicalReport).filter(MedicalReport.id == report_id, MedicalReport.patient_id == patient_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return r


def _doctor_report(db: Session, doctor: User, report_id: int) -> MedicalReport:
    """A report the doctor may act on: the patient has an active session with them."""
    r = db.get(MedicalReport, report_id)
    if not r or r.deleted_at or not AccessService(db).has_doctor_patient_access(doctor.id, r.patient_id):
        raise HTTPException(status_code=404, detail="Report not found or no active access")
    return r


@router.get("/types")
def record_types():
    return RECORD_TYPES


@router.post("/upload")
def upload_report(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    record_type: Optional[str] = Form(None),
    record_date: Optional[date] = Form(None),
    summary: Optional[str] = Form(None),
    report_id: Optional[str] = Form(None),
    patient_id: Optional[int] = Form(None),  # set by a family delegate uploading for someone
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target, link = acting_patient(db, user, patient_id, "UPLOAD")
    note = log_on_behalf(db, user, link, "upload_report")
    rec = store_report(db, patient_id=target, uploader=user, uploaded_by="PATIENT", file=file, record_type=record_type,
                       record_date=record_date, summary=summary, report_id=report_id, on_behalf_note=note)
    start_processing(db, background, rec)
    return serialize(rec)


@router.post("/upload-by-doctor")
@router.post("/upload-by-lab")
def upload_report_by_provider(
    background: BackgroundTasks,
    patient_id: Optional[int] = Form(None),
    abha_number: Optional[str] = Form(None),  # labs usually know the patient by ABHA
    file: UploadFile = File(...),
    record_type: Optional[str] = Form(None),
    record_date: Optional[date] = Form(None),
    summary: Optional[str] = Form(None),
    report_id: Optional[str] = Form(None),
    user: User = Depends(require_role("doctor", "lab")),
    db: Session = Depends(get_db),
):
    # require_role already rejects doctors/labs without a registry match
    if abha_number:
        match = db.query(User).filter(User.abha_number == normalize_abha(abha_number), User.role == "patient").first()
        if not match:
            raise HTTPException(status_code=404, detail="No patient has linked this ABHA number")
        patient_id = match.id
    if patient_id is None:
        raise HTTPException(status_code=422, detail="Give the patient ID or ABHA number")
    if user.role == "doctor" and not AccessService(db).has_doctor_patient_access(user.id, patient_id):
        raise HTTPException(status_code=403, detail="Doctor has no access to this patient")
    # shortcut: a verified lab can upload for any existing patient ID (write-only, tagged LAB);
    # add a patient-issued lab order/QR check when the lab flow is built.
    if user.role == "lab" and not db.query(User).filter(User.id == patient_id, User.role == "patient").first():
        raise HTTPException(status_code=404, detail="Patient not found")
    rec = store_report(db, patient_id=patient_id, uploader=user, uploaded_by=user.role.upper(), file=file,
                       record_type=record_type or ("Lab Report" if user.role == "lab" else None),
                       record_date=record_date, summary=summary, report_id=report_id)
    start_processing(db, background, rec)
    return serialize(rec, with_url=False)


@router.get("/my")
def my_reports(background: BackgroundTasks, patient_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Timeline for the patient (or a family member they are a VIEW_RECORDS delegate of), newest first."""
    target, link = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    log_on_behalf(db, user, link, "view_records")
    items = db.query(MedicalReport).filter(MedicalReport.patient_id == target, MedicalReport.deleted_at.is_(None)).all()
    queue_summaries(db, background, sorted(items, key=lambda r: r.id, reverse=True))  # older records get AI one-liners too
    out = [serialize(r) for r in items]
    out.sort(key=lambda r: r["record_date"], reverse=True)
    return out


@router.get("/{report_id}/file")
def report_file(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A fresh signed link to the owner's file (list links expire after 5 minutes)."""
    r = db.get(MedicalReport, report_id)
    if not r or r.deleted_at:
        raise HTTPException(status_code=404, detail="Report not found")
    acting_patient(db, user, r.patient_id if r.patient_id != user.id else None, "VIEW_RECORDS")
    return {"url": file_url(r.file_key)}


@router.post("/{report_id}/summarize")
def resummarize(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """'Rewrite summary': regenerate the AI one-liner and details now (owner or VIEW_RECORDS delegate)."""
    r = db.get(MedicalReport, report_id)
    if not r or r.deleted_at:
        raise HTTPException(status_code=404, detail="Report not found")
    acting_patient(db, user, r.patient_id if r.patient_id != user.id else None, "VIEW_RECORDS")
    from app.services import ai
    if not ai.enabled():
        raise HTTPException(status_code=503, detail="AI summaries are off: add GEMINI_API_KEY to backend/.env")
    summarize_report(db, r)
    if r.ai_status != "DONE":
        raise HTTPException(status_code=502, detail="Couldn't summarise this record right now. Try again in a minute.")
    return serialize(r)


@router.get("/summary")
def my_summary(patient_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target, _ = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    return patient_summary(db, db.get(User, target))


@router.get("/insights")
def my_insights(patient_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pattern alerts, only when the patient switched them on (docx: only if the patient wants)."""
    target, _ = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    patient = db.get(User, target)
    return {"enabled": patient.health_alerts_enabled, "alerts": health_insights(db, patient) if patient.health_alerts_enabled else []}


class AskBody(BaseModel):
    question: str
    patient_id: Optional[int] = None


@router.post("/ask")
def ask(body: AskBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Records chatbot: answers from the patient's own data only."""
    if not body.question.strip() or len(body.question) > 300:
        raise HTTPException(status_code=422, detail="Ask a question of up to 300 characters")
    target, link = acting_patient(db, user, body.patient_id, "VIEW_RECORDS")
    log_on_behalf(db, user, link, "view_records_via_assistant")
    return assistant_answer(db, db.get(User, target), body.question)


@router.get("/patient-summary/{patient_id}")
def doctor_patient_summary(patient_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    if not AccessService(db).has_doctor_patient_access(doctor.id, patient_id):
        record_denied_doctor_access(db, doctor, patient_id, "health summary")
        raise HTTPException(status_code=403, detail="No active access to this patient")
    record_doctor_access(db, doctor, patient_id, "health summary")
    return patient_summary(db, db.get(User, patient_id))


@router.get("/deleted")
def deleted_reports(user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    items = db.query(MedicalReport).filter(MedicalReport.patient_id == user.id, MedicalReport.deleted_at.isnot(None)).all()
    return [serialize(r, with_url=False) for r in items]


@router.post("/{report_id}/restore")
def restore_report(report_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    r = _patient_report(db, user.id, report_id)
    r.deleted_at = None
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: restore_report, ID: {r.report_id}"))
    db.commit()
    return serialize(r)


@router.get("/trends/{patient_id}")
def get_report_trends(patient_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target, _ = acting_patient(db, user, patient_id, "VIEW_RECORDS")
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == target, MedicalReport.deleted_at.is_(None)).all()
    keys = ("bp_systolic", "bp_diastolic", "heart_rate", "glucose", "weight", "temperature")
    rows = []
    for r in reports:
        when = r.report_date or r.created_at
        values = {k: getattr(r, k) for k in keys}
        if when and any(v is not None for v in values.values()):
            rows.append({"date": when.strftime("%Y-%m-%d"), "report_id": r.id, **values})
    rows.sort(key=lambda row: row["date"])
    return rows


@router.delete("/{report_id}")
def delete_report(report_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    """Soft delete: hidden everywhere and doctor grants revoked, but restorable from /reports/deleted."""
    report = _patient_report(db, user.id, report_id)
    report.deleted_at = datetime.utcnow()
    db.query(ReportAccessRequest).filter(ReportAccessRequest.report_id == report.id).delete()
    db.query(ReportAccess).filter(ReportAccess.report_id == report.id, ReportAccess.revoked_at.is_(None)).update({"revoked_at": datetime.utcnow()})
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: delete_report, ID: {report.report_id}"))
    db.commit()
    return {"message": "Report moved to deleted items. You can restore it."}


@router.get("/list")
def list_reports(patient_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    # Listing is allowed without a session so doctors see what to request (the "locked" view).
    # No file URLs here; clinical text only once the patient has granted access.
    has_access = AccessService(db).has_doctor_patient_access(doctor.id, patient_id)
    record_doctor_access(db, doctor, patient_id, "profile")
    items = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id, MedicalReport.deleted_at.is_(None)).all()
    out = []
    for r in items:
        row = serialize(r, with_url=False)
        if not has_access:
            for k in ("summary", "user_summary", "one_line_summary", "vitals", "ai_summary", "ai_details"):
                row[k] = None
        out.append(row)
    out.sort(key=lambda r: r["record_date"], reverse=True)
    return out


@router.post("/{report_id}/review")
def mark_reviewed(report_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    r = _doctor_report(db, doctor, report_id)
    r.reviewed_by, r.reviewed_at = doctor.id, datetime.utcnow()
    db.add(AuditLog(actor_user_id=doctor.id, patient_id=r.patient_id, details=f"Action: review_report, ID: {r.report_id}, Doctor: {doctor.id}"))
    db.commit()
    return serialize(r, with_url=False)


class CommentBody(BaseModel):
    body: str


@router.get("/{report_id}/comments")
def list_comments(report_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    r = _doctor_report(db, doctor, report_id)
    rows = db.query(ReportComment).filter(ReportComment.report_id == r.id).order_by(ReportComment.created_at).all()
    return [{"id": c.id, "body": c.body, "doctor_id": c.doctor_id, "doctor_name": c.doctor.display_name if c.doctor else None,
             "created_at": c.created_at.isoformat()} for c in rows]


@router.post("/{report_id}/comments")
def add_comment(report_id: int, body: CommentBody, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    r = _doctor_report(db, doctor, report_id)
    text = body.body.strip()
    if not text or len(text) > 2000:
        raise HTTPException(status_code=422, detail="Comment must be 1-2000 characters")
    c = ReportComment(report_id=r.id, doctor_id=doctor.id, body=text)
    db.add(c)
    db.commit()
    return {"id": c.id, "body": c.body, "doctor_id": doctor.id, "doctor_name": doctor.display_name, "created_at": c.created_at.isoformat()}


class ReportAccessRequestBody(BaseModel):
    report_ids: List[int]
    access_mode: str = "NORMAL"  # NORMAL or EMERGENCY


@router.post("/access")
def access_reports(
    body: ReportAccessRequestBody, 
    doctor: User = Depends(require_role("doctor")), 
    db: Session = Depends(get_db)
):
    """
    Explicit Semantic Access Endpoint.
    1. Validates Session/Permission
    2. CHECKS FINE-GRAINED REPORT ACCESS (New Phase 6)
    3. Generates Access URLs
    4. LOGS THE INTENT (Audit Trail)
    """
    # ... (existing session check) ...
    
    if not body.report_ids:
        return []

    reports = db.query(MedicalReport).filter(MedicalReport.id.in_(body.report_ids), MedicalReport.deleted_at.is_(None)).all()
    if not reports:
        raise HTTPException(status_code=404, detail="Reports not found")

    patient_id = reports[0].patient_id
    
    # Verify Session
    session = db.query(ActiveAccessSession).filter(
        ActiveAccessSession.doctor_id == doctor.id,
        ActiveAccessSession.patient_id == patient_id,
        ActiveAccessSession.revoked_at.is_(None),
        ActiveAccessSession.expires_at > dt.utcnow()
    ).first()

    if not session:
        record_denied_doctor_access(db, doctor, patient_id, "records")
        raise HTTPException(status_code=403, detail="No active session. Please request access.")

    # FINE-GRAINED CHECK
    report_service = ReportAccessService(db)
    
    # Filter Allowed IDs
    allowed_ids = []
    for rid in body.report_ids:
        if report_service.can_view_report(session.id, rid):
            allowed_ids.append(rid)
            
    if not allowed_ids:
         raise HTTPException(status_code=403, detail="Access denied for selected reports. Patient has not granted access.")

    # Only process allowed
    reports = [r for r in reports if r.id in allowed_ids]

    # ... (rest of logic) ...


    results = []
    filenames = []
    for r in reports:
        if r.patient_id != patient_id: 
            continue # Skip mixed-patient hacks
            
        url = file_url(r.file_key)
        results.append({
            "id": r.id,
            "url": url
        })
        filenames.append(r.filename)

    # 3. LOG INTENT (The specific allowed action)
    log_service = LogService(db)
    log_service.log_accessible_action(
        actor_user_id=doctor.id,
        patient_id=patient_id,
        event_type="VIEW_REPORTS",
        details_dict={
            "Count": len(results),
            "Files": ", ".join(filenames)
        },
        access_mode="NORMAL" # body.access_mode.upper() - Force NORMAL for now as access_reports is context unaware slightly
    )
    AccessService(db).update_doctor_interaction(patient_id=patient_id, doctor_id=doctor.id)
    record_doctor_access(db, doctor, patient_id, "records")
    
    return results
