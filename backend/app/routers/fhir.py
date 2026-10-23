"""FHIR R4 export (docx: standardized interoperability). Storage stays relational; FHIR is the exchange format."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.deps import get_db
from app.models import AuditLog, MedicalReport, User
from app.services.access_service import AccessService
from app.services.family import acting_patient
from app.services.misuse import record_denied_doctor_access, record_doctor_access
from app.services.records import _record_date, one_line_summary, patient_summary, trust_badge

router = APIRouter()

# LOINC codes for the vitals we extract
_LOINC = {
    "bp_systolic": ("8480-6", "Systolic blood pressure", "mm[Hg]"),
    "bp_diastolic": ("8462-4", "Diastolic blood pressure", "mm[Hg]"),
    "heart_rate": ("8867-4", "Heart rate", "/min"),
    "glucose": ("2339-0", "Glucose [Mass/volume] in Blood", "mg/dL"),
    "weight": ("29463-7", "Body weight", "kg"),
}
_DOC_TYPE = {  # LOINC document types
    "Prescription": ("57833-6", "Prescription for medication"),
    "Lab Report": ("11502-2", "Laboratory report"),
    "Discharge Summary": ("18842-5", "Discharge summary"),
    "OPD Visit Notes": ("11488-4", "Consult note"),
    "Imaging": ("18748-4", "Diagnostic imaging study"),
}


def _entry(resource: dict) -> dict:
    return {"fullUrl": f"urn:uuid:{resource['resourceType'].lower()}-{resource['id']}", "resource": resource}


def build_bundle(db: Session, patient: User) -> dict:
    snap = patient_summary(db, patient)
    pid = str(patient.id)
    subject = {"reference": f"Patient/{pid}"}
    entries = [_entry({
        "resourceType": "Patient",
        "id": pid,
        "identifier": [{"system": "https://healthid.ndhm.gov.in", "value": patient.abha_number}] if patient.abha_number else [],
        "name": [{"text": snap["name"]}] if snap["name"] else [],
        "gender": {"M": "male", "F": "female"}.get((snap["gender"] or "")[:1].upper(), "unknown"),
    })]
    for i, text in enumerate(snap["chronic_conditions"]):
        entries.append(_entry({"resourceType": "Condition", "id": f"{pid}-c{i}", "subject": subject, "code": {"text": text}}))
    for i, text in enumerate(snap["allergies"]):
        entries.append(_entry({"resourceType": "AllergyIntolerance", "id": f"{pid}-a{i}", "patient": subject, "code": {"text": text}}))
    for i, text in enumerate(snap["current_medications"]):
        entries.append(_entry({"resourceType": "MedicationStatement", "id": f"{pid}-m{i}", "subject": subject,
                               "status": "active", "medicationCodeableConcept": {"text": text}}))

    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient.id, MedicalReport.deleted_at.is_(None)).all()
    for r in reports:
        when = _record_date(r).isoformat()
        code, display = _DOC_TYPE.get(r.record_type, ("34133-9", "Summary of episode note"))
        entries.append(_entry({
            "resourceType": "DocumentReference", "id": f"r{r.id}", "status": "current", "subject": subject, "date": when,
            "type": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}], "text": r.record_type},
            "description": one_line_summary(r),
            "meta": {"tag": [{"system": "urn:ownyourhealth:trust", "code": trust_badge(r)}]},
            "content": [{"attachment": {"contentType": r.mime_type, "title": r.filename, "hash": r.sha256_hash}}],
        }))
        for key, (loinc, name, unit) in _LOINC.items():
            value = getattr(r, key)
            if value is not None:
                entries.append(_entry({
                    "resourceType": "Observation", "id": f"r{r.id}-{key}", "status": "final", "subject": subject,
                    "effectiveDateTime": when, "derivedFrom": [{"reference": f"DocumentReference/r{r.id}"}],
                    "code": {"coding": [{"system": "http://loinc.org", "code": loinc, "display": name}]},
                    "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
                }))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.utcnow().isoformat() + "Z", "entry": entries}


@router.get("/Patient/{patient_id}/$everything")
def everything(patient_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "doctor":
        if not user.verified_at or not AccessService(db).has_doctor_patient_access(user.id, patient_id):
            if user.verified_at:
                record_denied_doctor_access(db, user, patient_id, "records export")
            raise HTTPException(status_code=403, detail="No active access to this patient")
        record_doctor_access(db, user, patient_id, "records export")
    else:
        acting_patient(db, user, patient_id, "VIEW_RECORDS")
    patient = db.get(User, patient_id)
    db.add(AuditLog(actor_user_id=user.id, patient_id=patient_id, details=f"Action: fhir_export, Role: {user.role}"))
    db.commit()
    return build_bundle(db, patient)
