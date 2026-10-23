"""Records chatbot (docx: "Show my last sugar report", "What medicines am I currently taking?").

Keyword intents answered only from the patient's own stored data: no external AI service, so health
data never leaves the server, and answers are lookups, never diagnosis or advice.
"""
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import ActiveAccessSession, MedicalReport, User
from app.services.records import _record_date, one_line_summary, patient_summary

# (keywords, report column, label, unit). Checked before generic "report" questions.
VITALS = [
    (("sugar", "glucose", "diabet", "hba1c"), "glucose", "blood sugar", "mg/dL"),
    (("bp", "blood pressure", "pressure", "hypertension"), "bp_systolic", "blood pressure", "mmHg"),
    (("weight",), "weight", "weight", "kg"),
    (("pulse", "heart rate", "heartbeat"), "heart_rate", "heart rate", "bpm"),
    (("temperature", "fever", "temp"), "temperature", "temperature", ""),
]
RECORD_KINDS = [
    (("prescription", "rx"), "Prescription"),
    (("x-ray", "xray", "scan", "imaging", "mri", "ct"), "Imaging"),
    (("discharge",), "Discharge Summary"),
    (("lab", "test", "blood report"), "Lab Report"),
]
EXAMPLES = ["Show my last sugar report", "What medicines am I taking?", "What was my last BP?",
            "Show my latest prescription", "Who has access to my records?", "Give me my health summary"]
NOT_ADVICE = " This is what your reports say, not medical advice."


def _has(q: str, words) -> bool:
    return any(re.search(rf"\b{re.escape(w)}", q) for w in words)


def _day(d: datetime) -> str:
    return d.strftime("%d %b %Y")


def answer(db: Session, patient: User, question: str) -> dict:
    q = question.lower().strip()
    reports = db.query(MedicalReport).filter(MedicalReport.patient_id == patient.id, MedicalReport.deleted_at.is_(None)).all()
    reports.sort(key=_record_date, reverse=True)

    def reply(text: str, recs=()):
        return {"answer": text, "records": [{"id": r.id, "record_type": r.record_type or "Other",
                                             "record_date": _record_date(r).isoformat(), "one_line_summary": one_line_summary(r)} for r in recs]}

    for words, col, label, unit in VITALS:
        if _has(q, words):
            with_value = [r for r in reports if getattr(r, col) is not None]
            if not with_value:
                return reply(f"I couldn't find a {label} value in your uploaded reports yet.")
            last = with_value[0]
            value = f"{last.bp_systolic}/{last.bp_diastolic}" if col == "bp_systolic" and last.bp_diastolic else getattr(last, col)
            text = f"Your last {label} reading was {value} {unit} on {_day(_record_date(last))} ({last.record_type or 'record'})."
            if len(with_value) > 1:
                prev = with_value[1]
                pv = f"{prev.bp_systolic}/{prev.bp_diastolic}" if col == "bp_systolic" and prev.bp_diastolic else getattr(prev, col)
                text += f" Before that: {pv} {unit} on {_day(_record_date(prev))}."
            return reply(text + NOT_ADVICE, with_value[:2])

    snap = patient_summary(db, patient)
    if _has(q, ("medicine", "medication", "tablet", "drug", "taking", "pill")):
        meds = snap["current_medications"]
        return reply(f"Your current medications: {', '.join(meds)}." if meds else
                     "No current medications are recorded. You can add them on your emergency card.")
    if _has(q, ("allerg",)):
        a = snap["allergies"]
        return reply(f"Recorded allergies: {', '.join(a)}." if a else "No allergies are recorded on your emergency card.")
    if _has(q, ("condition", "disease", "diagnos", "chronic", "illness")):
        c = snap["chronic_conditions"]
        return reply(f"Recorded conditions: {', '.join(c)}." if c else "No chronic conditions are recorded.")
    if _has(q, ("blood group", "blood type")):
        return reply(f"Your blood group is {snap['blood_group']}." if snap["blood_group"] else "Your blood group isn't recorded yet.")
    if _has(q, ("access", "who can see", "who viewed", "shared")):
        sessions = db.query(ActiveAccessSession).filter(ActiveAccessSession.patient_id == patient.id,
                                                        ActiveAccessSession.revoked_at.is_(None),
                                                        ActiveAccessSession.expires_at > datetime.utcnow()).all()
        names = [db.get(User, s.doctor_id).display_name or "a doctor" for s in sessions]
        return reply(f"Right now these doctors have access: {', '.join(names)}. You can revoke them in the Access tab." if names
                     else "No doctor has access to your records right now.")
    if _has(q, ("last visit", "visit", "hospital", "opd", "appointment")):
        v = snap["last_visit"]
        return reply(f"Your last recorded visit was {v['days_ago']} days ago ({v['type']}, {v['date']})." if v
                     else "I couldn't find a visit record. Upload OPD or discharge notes to track visits.")
    for words, kind in RECORD_KINDS:
        if _has(q, words):
            match = [r for r in reports if (r.record_type or "Other") == kind]
            if not match:
                return reply(f"You don't have any {kind.lower()} records yet.")
            return reply(f"Your latest {kind.lower()} is from {_day(_record_date(match[0]))}: {one_line_summary(match[0])}", match[:1])
    if _has(q, ("how many", "count", "number of")):
        return reply(f"You have {snap['total_records']} records, {snap['verified_record_count']} of them verified by a doctor or lab.")
    if _has(q, ("summary", "overview", "health", "snapshot", "report")):
        return reply(snap["overview"], reports[:3])
    return reply("I can answer questions about your own records. Try: " + "; ".join(f'"{e}"' for e in EXAMPLES) + ".")
