"""The patient's health history: one Gemini pass over all their records, saved and shareable with a doctor.

Falls back to a rule-based history (from the patient snapshot) when Gemini is off or fails.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import HealthHistory, HealthHistoryShare, MedicalReport, User
from app.services import ai
from app.services.records import _record_date, health_insights, one_line_summary, patient_summary

SYSTEM = (
    "You write a short medical history for a patient from their own records, so a new doctor can catch up "
    "in one minute and the patient can understand it. Use only facts in the records; never invent. Do not "
    "diagnose beyond what the records state and give no treatment advice. Cite the record ids each item comes "
    "from in report_ids. overview: 2-4 plain sentences, most important first (active conditions, current "
    "medicines, allergies, recent changes). trends: only measurements seen in 2 or more records."
)
_ITEM = {"type": "OBJECT", "properties": {
    "name": {"type": "STRING"}, "detail": {"type": "STRING"},
    "report_ids": {"type": "ARRAY", "items": {"type": "INTEGER"}}}, "required": ["name", "detail", "report_ids"]}
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "overview": {"type": "STRING"},
        "conditions": {"type": "ARRAY", "items": _ITEM},
        "medications": {"type": "ARRAY", "items": _ITEM},
        "allergies": {"type": "ARRAY", "items": {"type": "STRING"}},
        "trends": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "name": {"type": "STRING"}, "change": {"type": "STRING"},
            "direction": {"type": "STRING", "enum": ["rising", "falling", "stable"]},
            "report_ids": {"type": "ARRAY", "items": {"type": "INTEGER"}}}, "required": ["name", "change", "direction", "report_ids"]}},
        "events": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "date": {"type": "STRING"}, "title": {"type": "STRING"}, "detail": {"type": "STRING"},
            "report_ids": {"type": "ARRAY", "items": {"type": "INTEGER"}}}, "required": ["date", "title", "report_ids"]}},
    },
    "required": ["overview", "conditions", "medications", "allergies", "trends", "events"],
}
MAX_REPORTS = 40


def _reports(db: Session, patient_id: int) -> list[MedicalReport]:
    rows = db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id, MedicalReport.deleted_at.is_(None)).all()
    return sorted(rows, key=_record_date, reverse=True)


def _rules(snapshot: dict, insights: list[str]) -> dict:
    item = lambda name: {"name": name, "detail": "", "report_ids": []}
    return {
        "overview": snapshot["overview"],
        "conditions": [item(c) for c in snapshot["chronic_conditions"]],
        "medications": [item(m) for m in snapshot["current_medications"]],
        "allergies": snapshot["allergies"],
        "trends": [{"name": i, "change": "", "direction": "rising" if "increasing" in i else "falling", "report_ids": []}
                   for i in insights if "values" in i],
        "events": [{"date": t["date"], "title": t["summary"], "detail": "", "report_ids": [t["id"]]} for t in snapshot["recent_tests"]],
    }


def generate(db: Session, patient: User) -> HealthHistory:
    reports = _reports(db, patient.id)
    snapshot = patient_summary(db, patient)
    content, source = None, "RULES"
    if ai.enabled() and reports:
        profile = (f"Patient: age {snapshot['age']}, gender {snapshot['gender']}, blood group {snapshot['blood_group']}. "
                   f"Self-reported conditions: {', '.join(snapshot['chronic_conditions']) or 'none'}; medicines: "
                   f"{', '.join(snapshot['current_medications']) or 'none'}; allergies: {', '.join(snapshot['allergies']) or 'none'}.")
        lines = []
        for r in reports[:MAX_REPORTS]:
            d = r.ai_details or {}
            values = "; ".join(f"{v.get('name')} {v.get('value')} {v.get('unit') or ''} ({v.get('status')})" for v in d.get("values") or [])
            lines.append(f"[id {r.id}] {_record_date(r).date().isoformat()} {r.record_type or 'Other'} by {r.uploaded_by}: "
                         f"{one_line_summary(r)}. {d.get('summary') or ''} {('Values: ' + values) if values else ''} "
                         f"{('Text: ' + (r.extracted_text or '')[:800]) if not r.ai_details and r.extracted_text else ''}")
        content = ai.generate_json(SYSTEM, [{"text": profile + "\nRecords, newest first:\n" + "\n".join(lines)}], SCHEMA, budget=75)
        if content:
            source = "AI"
            known = {r.id for r in reports}  # drop citations to records that don't exist
            for key in ("conditions", "medications", "trends", "events"):
                for row in content.get(key) or []:
                    row["report_ids"] = [i for i in row.get("report_ids") or [] if i in known]
    if not content:
        content = _rules(snapshot, health_insights(db, patient))

    h = db.query(HealthHistory).filter(HealthHistory.patient_id == patient.id).first() or HealthHistory(patient_id=patient.id)
    h.content, h.source, h.report_count, h.generated_at = content, source, len(reports), datetime.utcnow()
    db.add(h)
    db.commit()
    return h


def serialize(db: Session, patient_id: int, h: HealthHistory | None) -> dict:
    count = len(_reports(db, patient_id))
    shares = (db.query(HealthHistoryShare, User).join(User, HealthHistoryShare.doctor_id == User.id)
              .filter(HealthHistoryShare.patient_id == patient_id, HealthHistoryShare.revoked_at.is_(None)).all())
    return {
        "ai_enabled": ai.enabled(),
        "report_count": count,
        "history": None if not h else {
            **h.content, "source": h.source, "report_count": h.report_count,
            "generated_at": h.generated_at.isoformat(), "stale": h.report_count != count,
        },
        "shared_with": [{"doctor_id": d.id, "doctor_name": d.display_name or d.email, "since": s.created_at.isoformat()} for s, d in shares],
    }
