"""End-to-end check of the docx features against a running backend.

Run: python verify_features.py [base_url]   (default http://localhost:8000; needs OTP_DEV_ECHO=1 on the server)
Creates its own test patients/doctor; safe to re-run (uses fresh phone numbers each time).
"""
import json
import random
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
PNG = (Path(__file__).parent.parent / "mobile/assets/favicon.png").read_bytes()
failures = []


def call(path, body=None, token=None, method=None, form=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = None
    if form is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in form.items():
            if k == "file":
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + v + b"\r\n")
            else:
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data is not None else "GET"), headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def otp_login(**who):
    st, sent = call("/auth/otp/request", who)
    assert st == 200, sent
    st, tok = call("/auth/otp/verify", {**who, "code": sent["dev_otp"], "display_name": who.get("name", "Test")})
    assert st == 200, tok
    return tok


def new_phone():
    return "9" + "".join(random.choice("0123456789") for _ in range(9))


# --- offline: vitals extraction from OCR text ---------------------------------
from app.services.report_extraction import extract_bp
check("BP from 'a/b' form", extract_bp("bp 130/85 mmhg") == (130, 85))
check("BP from separate systolic/diastolic lines", extract_bp("systolic bp: 168 mmhg diastolic bp: 102 mmhg") == (168, 102))

# --- new-user sign-up and password reset -------------------------------------
su_email = f"signup.{uuid.uuid4().hex[:8]}@example.com"
su = {"display_name": "Sign Up Test", "phone": new_phone(), "email": su_email, "password": "correct-horse-1",
      "date_of_birth": "1994-03-12", "gender": "Female"}
st, _ = call("/auth/signup", {**su, "password": "short"})
check("sign-up rejects a short password", st == 422, _)
st, _ = call("/auth/signup", {**su, "date_of_birth": "2999-01-01"})
check("sign-up rejects a future birth date", st == 422, _)
st, sent = call("/auth/signup", su)
check("sign-up emails a code first and creates nothing yet", st == 200 and "dev_otp" in sent and call("/auth/login", {"email": su_email, "password": su["password"]})[0] == 401, sent)
st, _ = call("/auth/signup", {**su, "code": "000000"})
check("sign-up rejects a wrong code", st == 400, _)
st, tok = call("/auth/signup", {**su, "code": sent["dev_otp"]})
check("sign-up creates the patient", st == 200 and tok["role"] == "patient", tok)
st, prof = call("/user/me/profile", token=tok["access_token"])
check("new account's mobile is not marked verified by an email code", st == 200 and prof["phone"] == su["phone"] and not prof["phone_verified"], prof)
st, sm = call("/reports/summary", token=tok["access_token"])
check("sign-up keeps name and gender for the snapshot", st == 200 and sm["name"] == "Sign Up Test" and sm["gender"] == "Female", sm)
st, _ = call("/auth/signup", su)
check("sign-up refuses a duplicate email", st == 409, _)
st, _ = call("/auth/signup", {**su, "email": "x" + su_email})
check("sign-up refuses a duplicate mobile", st == 409, _)
st, _ = call("/auth/password/forgot", {"email": "nobody." + su_email})
check("password reset doesn't reveal unknown emails", st == 200, _)
st, sent = call("/auth/password/forgot", {"email": su_email.upper()})
st, _ = call("/auth/password/reset", {"email": su_email, "code": "000000", "new_password": "new-password-1"})
check("password reset rejects a wrong code", st == 400, _)
st, _ = call("/auth/password/reset", {"email": su_email, "code": sent["dev_otp"], "new_password": "new-password-1"})
check("password reset works, old password stops", st == 200 and call("/auth/login", {"email": su_email, "password": su["password"]})[0] == 401
      and call("/auth/login", {"email": su_email.upper(), "password": "new-password-1"})[0] == 200, _)

# --- patient verification: mobile OTP + ABHA ---------------------------------
g_phone = new_phone()
g = otp_login(phone=g_phone)
G = g["access_token"]
st, prof = call("/user/me/profile", token=G)
check("mobile OTP login creates verified patient", st == 200 and prof["phone_verified"], prof)
st, bad = call("/auth/otp/verify", {"phone": g_phone, "code": "000000"})
check("wrong/expired OTP rejected", st == 400, bad)
st, sent = call("/user/me/abha", {"abha_number": "91-2345-6789-0123"}, G)
check("ABHA link sends OTP to ABHA mobile", st in (200, 429) and (st == 429 or sent["sent_to"].endswith("0002")), sent)

rahul_phone = new_phone()
r = otp_login(phone=rahul_phone, name="Rahul")
R = r["access_token"]

# --- records: type/date/summary, one-line summary, profile summary -----------
st, rec = call("/reports/upload", token=G, form={"file": PNG, "record_type": "Lab Report", "record_date": date.today().isoformat(),
                                                   "summary": "HbA1c slightly high, repeat in 3 months"})
check("upload with type/date/summary", st == 200 and rec["record_type"] == "Lab Report", rec)
check("one-line summary uses user summary", st == 200 and rec["one_line_summary"] == "HbA1c slightly high, repeat in 3 months", rec)
st, rec2 = call("/reports/upload", token=G, form={"file": PNG, "record_type": "Prescription", "record_date": "2024-01-10"})
check("one-line summary auto-built", st == 200 and rec2["one_line_summary"].startswith("Prescription:"), rec2)
check("old prescription decays (not relevant)", st == 200 and rec2["relevant"] is False, rec2)
st, bad = call("/reports/upload", token=G, form={"file": PNG, "record_type": "Selfie"})
check("unknown record type rejected", st == 422, bad)
st, summ = call("/reports/summary", token=G)
check("patient profile summary", st == 200 and summ["total_records"] >= 2 and summ["overview"].endswith("."), summ)

# --- family mode ---------------------------------------------------------------
st, add = call("/family/members", {"name": "Rahul", "relation": "Grandson", "phone": rahul_phone,
                                   "permissions": ["VIEW_RECORDS", "APPROVE_ACCESS"], "duration_days": 30}, G)
check("add family member sends OTP", st == 200 and "dev_otp" in add, add)
link_id = add["member"]["id"]
st, _ = call("/reports/my?patient_id=" + str(g["user_id"]), token=R)
check("unverified member has no access", st == 403, _)
st, ver = call(f"/family/members/{link_id}/verify", {"code": add["dev_otp"]}, G)
check("member verified by OTP", st == 200 and ver["verified"] and ver["expires_at"], ver)
st, caring = call("/family/caring-for", token=R)
check("delegate sees who they care for", st == 200 and any(c["patient_id"] == g["user_id"] for c in caring), caring)
st, recs = call(f"/reports/my?patient_id={g['user_id']}", token=R)
check("delegate views records (VIEW_RECORDS)", st == 200 and len(recs) >= 2, recs)
st, up = call("/reports/upload", token=R, form={"file": PNG, "record_type": "Other", "patient_id": g["user_id"]})
check("delegate cannot upload without UPLOAD", st == 403, up)
st, act = call("/family/activity", token=G)
check("delegate actions logged for patient", st == 200 and any("Grandson" in a["details"] for a in act), act)

# --- doctor: purpose, consent via delegate, review, comments, summary, FHIR --
st = 409
for hpr in json.loads((Path(__file__).parent / "app/fixtures/hpr.json").read_text(encoding="utf-8")):  # first HPR ID not yet claimed
    st, d = call("/auth/register", {"email": f"verify.doctor.{uuid.uuid4().hex[:6]}@ownyourhealth-demo.in", "password": uuid.uuid4().hex,
                                     "role": "doctor", "display_name": "Dr. Verify", "registry_id": hpr})
    if st == 200:
        break
if st != 200:
    print("SKIP doctor checks: every HPR ID in app/fixtures/hpr.json is already linked; add more to re-run")
else:
    D = d["access_token"]
    st, qr = call("/qr/generate", {}, G)
    st, bad = call("/access/request-v2", {"token": qr["token"], "patient_id": g["user_id"], "access_reason": "CURIOSITY"}, D)
    check("unknown access purpose rejected", st == 400, bad)
    st, req = call("/access/request-v2", {"token": qr["token"], "patient_id": g["user_id"], "access_reason": "SECOND_OPINION"}, D)
    st, pend = call(f"/access/requests/pending?patient_id={g['user_id']}", token=R)
    check("delegate sees request with purpose", st == 200 and pend and pend[0]["access_reason"] == "SECOND_OPINION", pend)
    st, ok = call("/access/approve", {"request_id": req["request_id"], "duration": "1h"}, R)
    check("delegate approves (APPROVE_ACCESS)", st == 200, ok)
    st, _ = call("/access/reports/grant", {"session_id": ok["session_id"], "report_ids": [rec["id"]], "duration": "1h"}, R)
    st, lst = call(f"/reports/list?patient_id={g['user_id']}", token=D)
    check("doctor list shows one-line summaries with access", st == 200 and lst[0]["one_line_summary"], lst)
    st, rv = call(f"/reports/{rec['id']}/review", {}, D)
    check("doctor marks reviewed -> badge", st == 200 and rv["trust_badge"] == "DOCTOR_REVIEWED", rv)
    st, c = call(f"/reports/{rec['id']}/comments", {"body": "Repeat HbA1c in 3 months"}, D)
    st, cs = call(f"/reports/{rec['id']}/comments", token=D)
    check("doctor comments", st == 200 and cs[-1]["body"] == "Repeat HbA1c in 3 months", cs)
    st, _ = call(f"/reports/{rec['id']}/comments", token=G)
    check("patient cannot read doctor-only comments", st == 403, _)
    st, ps = call(f"/reports/patient-summary/{g['user_id']}", token=D)
    check("doctor sees patient summary", st == 200 and "overview" in ps, ps)
    st, fhir = call(f"/fhir/Patient/{g['user_id']}/$everything", token=D)
    types = {e["resource"]["resourceType"] for e in fhir["entry"]} if st == 200 else set()
    check("FHIR bundle", {"Patient", "DocumentReference"} <= types, fhir)

    # --- doctor trust score --------------------------------------------------------------
    st, t = call(f"/doctors/{d['user_id']}/feedback", {"rating": 5}, G)
    check("patient who had a session can rate the doctor", st == 200 and t["breakdown"]["feedback"] == 30 and t["breakdown"]["registry"] == 40, t)
    st, _ = call(f"/doctors/{d['user_id']}/feedback", {"rating": 1}, otp_login(phone=new_phone())["access_token"])
    check("strangers can't rate a doctor", st == 403, _)
    st, d2 = 409, None
    for hpr2 in json.loads((Path(__file__).parent / "app/fixtures/hpr.json").read_text(encoding="utf-8")):
        st, d2 = call("/auth/register", {"email": f"verify.doctor2.{uuid.uuid4().hex[:6]}@ownyourhealth-demo.in", "password": uuid.uuid4().hex,
                                          "role": "doctor", "display_name": "Dr. Colleague", "registry_id": hpr2})
        if st == 200:
            break
    if st == 200:
        st, e = call("/doctors/endorse", {"hpr_id": hpr}, d2["access_token"])
        check("colleague endorsement raises community score", st == 200 and e["trust"]["breakdown"]["community"] == 2, e)
        st, _ = call("/doctors/endorse", {"hpr_id": hpr}, D)
        check("doctors can't endorse themselves", st == 422, _)
    st, pend_t = call("/reports/patient-summary/" + str(g["user_id"]), token=D)

    # --- misuse alerts (docx: alert, never block) -----------------------------------
    for _ in range(11):  # rule 1: >10 patient profiles in an hour
        other = otp_login(phone=new_phone())
        call(f"/reports/list?patient_id={other['user_id']}", token=D)
    st, alerts = call("/alerts", token=other["access_token"])
    check("rule 1: doctor browsing >10 patients alerts the patient", st == 200 and any(a["rule"] == "TOO_MANY_PATIENTS" for a in alerts), alerts)
    call("/access/revoke", {"doctor_id": d["user_id"], "reason": "test"}, G)
    st, _ = call("/reports/access", {"report_ids": [rec["id"]]}, D)
    st, alerts = call("/alerts", token=G)
    check("rule 3: access after consent ended is refused and alerted", st == 200 and any(a["rule"] == "NO_ACTIVE_CONSENT" for a in alerts), alerts)
    if alerts:
        st, _ = call(f"/alerts/{alerts[0]['id']}/seen", {}, G)
        check("patient can dismiss an alert", st == 200 and call("/alerts", token=G)[1][0]["seen"])

# --- lab: HFR-verified upload by ABHA ------------------------------------------
st, lab = call("/auth/register", {"email": f"verify.lab.{uuid.uuid4().hex[:6]}@ownyourhealth-demo.in", "password": uuid.uuid4().hex,
                                   "role": "lab", "display_name": "Verify Lab", "registry_id": "HFR0000000000"})
check("lab with unknown HFR rejected", st == 400, lab)
st, prof = call("/user/me/profile", token=G)
if prof.get("abha_number"):
    st, lab_rec = call("/reports/upload-by-lab", token=None, form={"file": PNG, "abha_number": prof["abha_number"]})
    check("lab upload needs a verified lab login", st == 401, lab_rec)

# --- soft delete / restore, insights, revoke family ---------------------------
st, _ = call(f"/reports/{rec2['id']}", method="DELETE", token=G)
st, mine = call("/reports/my", token=G)
st, gone = call("/reports/deleted", token=G)
check("soft delete hides and keeps a backup", rec2["id"] not in [x["id"] for x in mine] and rec2["id"] in [x["id"] for x in gone])
st, _ = call(f"/reports/{rec2['id']}/restore", {}, G)
st, mine = call("/reports/my", token=G)
check("restore", rec2["id"] in [x["id"] for x in mine])
# --- secure share link ------------------------------------------------------------
st, link = call("/share-links", {"report_ids": [rec["id"]], "duration": "1h", "note": "For Dr. Test"}, G)
check("patient creates a share link", st == 200 and link["report_count"] == 1, link)
st, view = call(f"/share-links/view/{link['token']}")
check("link shows only the chosen records, no login", st == 200 and [r["id"] for r in view["records"]] == [rec["id"]], view)
check("link views are counted", call("/share-links", token=G)[1][0]["view_count"] == 1)
st, other = call("/share-links", {"report_ids": [rec["id"]]}, R)
check("can't share someone else's records", st in (403, 404), other)
st, _ = call(f"/share-links/{link['id']}", method="DELETE", token=G)
st, gone = call(f"/share-links/view/{link['token']}")
check("revoked link stops working", st == 404, gone)
st, _ = call("/share-links/qr?url=https://evil.example/phish")
check("QR endpoint only encodes share links", st == 422)

# --- records chatbot -----------------------------------------------------------------
st, ans = call("/reports/ask", {"question": "Show my last lab report"}, G)
check("chatbot finds the latest lab report", st == 200 and "HbA1c" in ans["answer"] and ans["records"][0]["id"] == rec["id"], ans)
st, ans = call("/reports/ask", {"question": "What medicines am I taking?"}, G)
check("chatbot answers medicines from the profile", st == 200 and "medication" in ans["answer"].lower(), ans)
st, ans = call("/reports/ask", {"question": "What's the weather?"}, G)
check("chatbot falls back to examples", st == 200 and "Try:" in ans["answer"], ans)
st, ans = call(f"/reports/ask", {"question": "show my reports", "patient_id": g["user_id"]}, token=otp_login(phone=new_phone())["access_token"])
check("chatbot can't read another patient's records", st == 403, ans)

call("/user/me/settings", {"health_alerts_enabled": True}, G, method="PUT")
st, ins = call("/reports/insights", token=G)
check("health insights opt-in", st == 200 and ins["enabled"] is True, ins)
for _ in range(21):  # rule 4: a delegate viewing >20 times a day
    call(f"/reports/my?patient_id={g['user_id']}", token=R)
st, alerts = call("/alerts", token=G)
check("rule 4: delegate overuse alerts the patient", st == 200 and any(a["rule"] == "DELEGATE_OVERUSE" for a in alerts), alerts)
from app.services.misuse import is_odd_hour  # rule 2 depends on the clock, so check the IST window offline
from datetime import datetime as _dt
check("rule 2: 12-5 AM IST window", is_odd_hour(_dt(2026, 1, 1, 19, 0)) and not is_odd_hour(_dt(2026, 1, 1, 23, 30)))
st, _ = call(f"/family/members/{link_id}", method="DELETE", token=G)
st, _ = call(f"/reports/my?patient_id={g['user_id']}", token=R)
check("removed member loses access instantly", st == 403, _)

print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
