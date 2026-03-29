from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from hashlib import sha256
import boto3
import os
import shutil
import tempfile
from pathlib import Path
from datetime import datetime
from ..database import SessionLocal
from ..models import MedicalReport, AuditLog, User, ActiveAccessSession, AccessLog, ReportAccess, ReportAccessRequest
from app.deps import require_role, get_db
from app.auth import get_current_user
from ..blockchain import store_hash_on_chain
from datetime import datetime as dt
from app.services.log_service import LogService
from app.services.access_service import AccessService
from app.services.report_extraction import extract_report_data
from app.services.doctor_directory import get_doctor_profile, verify_doctor
from pydantic import BaseModel
from typing import List

router = APIRouter()

def delete_stored_file(file_key: str) -> None:
    s3, bucket = get_s3()
    if s3 and bucket:
        try:
            s3.delete_object(Bucket=bucket, Key=file_key)
        except Exception:
            pass
        return

    local_path = Path("storage") / file_key
    if local_path.exists():
        local_path.unlink()

def get_s3():
    key = os.getenv("AWS_ACCESS_KEY_ID")
    secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    bucket = os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION", "us-east-1")
    if not key or not secret or not bucket:
        return None, None
    s3 = boto3.client("s3", aws_access_key_id=key, aws_secret_access_key=secret, region_name=region)
    return s3, bucket

@router.post("/upload")
def upload_report(report_id: str = Form(...), file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    print(f"DEBUG: Upload Request - User: {user.id}, ReportID: {report_id}, Filename: {file.filename}") # Debug Log
    if user.role not in {"patient", "doctor"}:
        raise HTTPException(status_code=403, detail="Only patients and verified doctors can upload reports")

    uploaded_by = "PATIENT"
    if user.role == "doctor":
        hpr_id = get_doctor_profile(user.id)["hpr_id"]
        if not verify_doctor(hpr_id):
            raise HTTPException(status_code=403, detail="Only verified doctors can upload as doctor")
        uploaded_by = "DOCTOR"

    data = file.file.read()
    digest = sha256(data).hexdigest()
    s3, bucket = get_s3()
    
    key = f"reports/{user.id}/{datetime.utcnow().timestamp()}_{file.filename}"
    
    if s3:
        s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=file.content_type)
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "").suffix) as temp_file:
            temp_file.write(data)
            temp_path = temp_file.name
    else:
        # Local fallback
        local_dir = Path("storage") / key
        local_dir.parent.mkdir(parents=True, exist_ok=True)
        with open(local_dir, "wb") as f:
            f.write(data)
        temp_path = str(local_dir)

    extraction_result = extract_report_data(temp_path, file.content_type)
    extracted_text = extraction_result["raw_text"]
    summary = extraction_result["summary"]
    report_date = extraction_result.get("report_date")
    print("OCR DEBUG START")
    print("FILE PATH:", temp_path)
    print("RAW TEXT:", extracted_text[:500])
    print("TEXT LENGTH:", len(extracted_text))
    print("STRUCTURED DATA:", extraction_result)
    print("OCR DATE:", extraction_result.get("report_date_str"))
    print("PARSED DATE:", report_date)
    print("OCR DEBUG END")
    if s3 and os.path.exists(temp_path):
        os.remove(temp_path)
            
    tx_hash = store_hash_on_chain(digest, report_id) or ""
    rec = MedicalReport(
        patient_id=user.id,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        file_key=key,
        sha256_hash=digest,
        report_id=report_id,
        blockchain_tx=tx_hash,
        extracted_text=extracted_text,
        summary=summary,
        uploaded_by=uploaded_by,
    )
    rec.bp_systolic = extraction_result.get("bp_systolic")
    rec.bp_diastolic = extraction_result.get("bp_diastolic")
    rec.heart_rate = extraction_result.get("heart_rate")
    rec.glucose = extraction_result.get("glucose")
    rec.report_date = report_date
    print("DB SAVE VALUES:", rec.bp_systolic, rec.bp_diastolic, rec.heart_rate, rec.glucose)
    db.add(rec)
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: upload_report, ID: {report_id}"))
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "sha256": digest, "blockchain_tx": tx_hash}


@router.post("/upload-by-doctor")
def upload_report_by_doctor(
    patient_id: int = Form(...),
    report_id: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    hpr_id = get_doctor_profile(user.id)["hpr_id"]
    if not verify_doctor(hpr_id):
        raise HTTPException(status_code=403, detail="Only verified doctors can upload as doctor")

    access_service = AccessService(db)
    if not access_service.has_doctor_patient_access(user.id, patient_id):
        raise HTTPException(status_code=403, detail="Doctor has no access to this patient")

    data = file.file.read()
    digest = sha256(data).hexdigest()
    s3, bucket = get_s3()
    key = f"reports/{patient_id}/{datetime.utcnow().timestamp()}_{file.filename}"

    if s3:
        s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=file.content_type)
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "").suffix) as temp_file:
            temp_file.write(data)
            temp_path = temp_file.name
    else:
        local_dir = Path("storage") / key
        local_dir.parent.mkdir(parents=True, exist_ok=True)
        with open(local_dir, "wb") as f:
            f.write(data)
        temp_path = str(local_dir)

    extraction_result = extract_report_data(temp_path, file.content_type)
    extracted_text = extraction_result["raw_text"]
    summary = extraction_result["summary"]
    report_date = extraction_result.get("report_date")
    if s3 and os.path.exists(temp_path):
        os.remove(temp_path)

    tx_hash = store_hash_on_chain(digest, report_id) or ""
    rec = MedicalReport(
        patient_id=patient_id,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        file_key=key,
        sha256_hash=digest,
        report_id=report_id,
        blockchain_tx=tx_hash,
        extracted_text=extracted_text,
        summary=summary,
        uploaded_by="DOCTOR",
    )
    rec.bp_systolic = extraction_result.get("bp_systolic")
    rec.bp_diastolic = extraction_result.get("bp_diastolic")
    rec.heart_rate = extraction_result.get("heart_rate")
    rec.glucose = extraction_result.get("glucose")
    rec.report_date = report_date
    db.add(rec)
    db.add(AuditLog(actor_user_id=user.id, patient_id=patient_id, details=f"Action: upload_report_by_doctor, ID: {report_id}"))
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "sha256": digest, "blockchain_tx": tx_hash}

@router.get("/my")
def my_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(MedicalReport).filter(MedicalReport.patient_id == user.id).all()
    items.sort(key=lambda report: (0 if report.uploaded_by == "DOCTOR" else 1, report.created_at or datetime.min))
    s3, bucket = get_s3()
    
    def presigned(key: str):
        if s3 and bucket:
            try:
                return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=300)
            except Exception:
                return None
        else:
            return f"/api/static/{key}"

    out = []
    for r in items:
        out.append({
            "id": r.id,
            "filename": r.filename,
            "mime_type": r.mime_type,
            "sha256_hash": r.sha256_hash,
            "blockchain_tx": r.blockchain_tx,
            "report_id": r.report_id,
            "summary": r.summary,
            "uploaded_by": r.uploaded_by,
            "presigned_url": presigned(r.file_key),
            "created_at": r.created_at
        })
    return out

@router.get("/trends/{patient_id}")
def get_report_trends(
    patient_id: int,
    user: User = Depends(require_role("patient")),
    db: Session = Depends(get_db),
):
    if user.id != patient_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    reports = db.query(MedicalReport).filter(
        MedicalReport.patient_id == patient_id
    ).all()

    rows = []
    for report in reports:
        bp_systolic = int(report.bp_systolic) if report.bp_systolic is not None else None
        bp_diastolic = int(report.bp_diastolic) if report.bp_diastolic is not None else None
        heart_rate = int(report.heart_rate) if report.heart_rate is not None else None
        glucose = int(report.glucose) if report.glucose is not None else None

        if report.report_date is None:
            continue

        if not any(value is not None for value in [bp_systolic, bp_diastolic, heart_rate, glucose]):
            continue

        rows.append({
            "date": report.report_date.strftime("%Y-%m-%d"),
            "bp_systolic": bp_systolic,
            "bp_diastolic": bp_diastolic,
            "heart_rate": heart_rate,
            "glucose": glucose,
        })

    rows.sort(key=lambda row: row["date"] or "")
    print("TRENDS API OUTPUT:", rows)
    return rows

@router.delete("/{report_id}")
def delete_report(report_id: int, user: User = Depends(require_role("patient")), db: Session = Depends(get_db)):
    report = db.query(MedicalReport).filter(MedicalReport.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    delete_stored_file(report.file_key)
    db.query(ReportAccessRequest).filter(ReportAccessRequest.report_id == report.id).delete()
    db.query(ReportAccess).filter(ReportAccess.report_id == report.id).delete()
    db.delete(report)
    db.add(AuditLog(actor_user_id=user.id, patient_id=user.id, details=f"Action: delete_report, ID: {report.report_id}"))
    db.commit()

    return {"message": "Report deleted successfully"}

@router.get("/list")
def list_reports(patient_id: int, doctor: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    # RELAXED CHECK: We allow listing reports even without a session
    # This enables the "Locked" view so doctors can Request Access.
    # We DO NOT generate presigned URLs here, so it is safe.
    
    s3, bucket = get_s3()
    items = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id).all()
    items.sort(key=lambda report: (0 if report.uploaded_by == "DOCTOR" else 1, report.created_at or datetime.min))
    
    out = []
    for r in items:
        # NOTICE: We NO LONGER generate presigned_url here.
        # This prevents "implicit access" just by listing files.
        # User must call /reports/access to view, which triggers an audit log.
        out.append({
            "id": r.id,
            "filename": r.filename,
            "mime_type": r.mime_type,
            "sha256_hash": r.sha256_hash,
            "blockchain_tx": r.blockchain_tx,
            "summary": r.summary,
            "uploaded_by": r.uploaded_by,
            "presigned_url": None, # Explicitly null to force use of access endpoint
            "created_at": r.created_at # CRITICAL for Frontend Date Display
        })
    
    return out

class ReportAccessRequestBody(BaseModel):
    report_ids: List[int]
    access_mode: str = "NORMAL" # NORMAL or EMERGENCY

from ..services.report_access_service import ReportAccessService

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

    reports = db.query(MedicalReport).filter(MedicalReport.id.in_(body.report_ids)).all()
    if not reports:
        raise HTTPException(status_code=404, detail="Reports not found")

    patient_id = reports[0].patient_id
    
    # Verify Session
    session = db.query(ActiveAccessSession).filter(
        ActiveAccessSession.doctor_id == doctor.id,
        ActiveAccessSession.patient_id == patient_id,
        ActiveAccessSession.expires_at > dt.utcnow()
    ).first()

    if not session:
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


    # 2. Generate URLs
    s3, bucket = get_s3()
    from urllib.parse import quote

    def presigned(key: str, patient_id: int):
        if s3 and bucket:
            try:
                return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=300)
            except Exception:
                return None
        else:
            # Local Storage Logic
            # Normalize key to be just filename if we are constructing path manually
            # BUT some keys might actually be `reports/4/file.png` in DB.
            
            final_path = ""
            if key.startswith("reports/") or f"/{patient_id}/" in key:
                 # Assume key is full relative path from storage root
                 final_path = key
            else:
                 # Key is filename, construct path
                 final_path = f"reports/{patient_id}/{key}"
            
            # URL Encode the path segments (but not the slashes)
            # Split by / and encode parts
            parts = final_path.split("/")
            encoded_parts = [quote(p) for p in parts]
            encoded_path = "/".join(encoded_parts)

            return f"/api/static/{encoded_path}"

    results = []
    filenames = []
    for r in reports:
        if r.patient_id != patient_id: 
            continue # Skip mixed-patient hacks
            
        url = presigned(r.file_key, r.patient_id)
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
    
    return results
