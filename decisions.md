# Decisions Log

Every architecture / scope decision goes here, newest at the bottom.
Format: **ID — title**, then *Status* (Proposed / Accepted / Superseded by D-xxx), *Decision*, *Why*.
Change a decision by adding a new entry that supersedes it — don't rewrite history.

Source of requirements: `BELOW ARE ALL THE ABHA FETURES THAT WE MUST IMPLEMENT.docx` (summarised in the baseline below).
UX references: DRiefcase (ABHA home, More menu with ABHA Profile / Link ABHA / Fetch Records / My Family / Token History) and a records screen with filter chips (All / Lab Tests / Prescription) and an empty-state "Upload Records" CTA.

---

## Baseline — repo state on 2026-10-19 (`main` @ 0468c2be)

Stack: FastAPI + SQLAlchemy + **PostgreSQL** (`backend/app/database.py`; the README's "SQLite" is outdated), React + Vite + Tailwind web app (`frontend/`), Solidity hash registry on Sepolia (`contracts/`, optional — skipped when env vars are unset), Tesseract OCR.

| Requirement (docx) | Status | Where / gap |
|---|---|---|
| Patient verification (ABHA login / mobile OTP) | ❌ Missing | Email+password only. Phone OTP exists on unmerged `feature/firebase-auth-notifications` (frontend only). |
| Doctor verification (HPR) | ⚠️ Fake | `services/doctor_directory.py` maps `user.id % 4` to a hard-coded profile — verification is accidental, not tied to anything the doctor entered. |
| Lab verification (HFR) | ❌ Missing | No `lab` role. |
| Consent-based access (purpose, time-limited, revocable) | ✅ Mostly | QR + direct requests, approve/deny, expiring sessions, per-report grants, revocation (`routers/access.py`, `report_access.py`). Purpose codes differ from docx list. |
| Emergency profile + QR (offline card) | ✅ Done | `routers/emergency_qr.py`, `emergency.py`, printable card endpoint. |
| Audit / access logs | ✅ Done | `AuditLog`, `AccessLog`, `EmergencyAccessLog`, patient & doctor history pages. |
| OCR extraction + vitals (BP, HR, glucose) + trends | ✅ Done | `services/report_extraction.py`, `/reports/trends/{id}`, `HealthTrends.tsx`. Weight/temperature not extracted. |
| Trust badges | ⚠️ Partial | `uploaded_by` = PATIENT/DOCTOR. No LAB, no "doctor-reviewed". |
| Record type + record date on upload | ⚠️ Partial | Date OCR-guessed; type detected but not stored; neither entered by user. |
| Health timeline view | ❌ Missing | Records are a list. |
| Doctor comments / mark-reviewed | ❌ Missing | |
| Access purpose (Treatment / Second opinion / Emergency / Insurance) | ⚠️ Partial | `access_reason` exists with different codes. |
| Misuse alert rules | ❌ Missing | Raw data exists in `access_logs`. |
| Family / caregiver mode | ⚠️ Unmerged | `origin/janhavi_search` adds `family.py`, `profile_switch.py`, `FamilyPage.tsx`. |
| FHIR interoperability | ❌ Missing | |
| Insurance / scheme summary + consent | ❌ Missing | |
| Relevance decay | ❌ Missing | |
| Side-by-side report comparison | ❌ Missing | |
| Patient snapshot summary | ⚠️ Unmerged? | `origin/sharli-ai-summaries` has no commits beyond main. |
| Backup of deleted docs | ❌ Missing | `DELETE /reports/{id}` hard-deletes file + row. |
| Encrypted exchange | ⚠️ Partial | Files stored in plain local disk / S3; no at-rest encryption. |
| Mobile patient app (Expo) | ❌ Missing | |

Risks found while reading (not features, but must be handled):
- Real-looking patient report images (`backend/storage/reports/**`) and `healthqr.db` are committed to git — a privacy problem for a health app.
- `SECRET_KEY` defaults to `"dev-secret"`; CORS is `*`; JWT lifetime is hard-coded to 60 min in `routers/auth.py`, ignoring `config.py`.
- `main.py` migrations use Postgres-only `ADD COLUMN IF NOT EXISTS`.
- `feature/firebase-auth-notifications` commits `node_modules/` and `dist/` (12k files) — can't be merged as-is.

---

## D-001 — Two clients, one backend
*Status:* Accepted (2026-10-19)
*Decision:* Keep `backend/` as the single FastAPI API. `frontend/` becomes the **doctor (and lab) web app**. Add `mobile/` — an **Expo (React Native) patient app**. Both clients talk to the same REST API.
*Why:* Consent, audit and verification rules must be enforced in one place. A second backend would duplicate the most security-sensitive code. Patient-side web pages stay working until the mobile app reaches parity, then get removed (see D-014).

## D-002 — Keep FastAPI + PostgreSQL, no rewrite
*Status:* Accepted
*Decision:* Extend the existing models/routers. No framework or DB change.
*Why:* ~3.7k lines of working consent/audit logic already exist. Rewriting buys nothing for the docx requirements.

## D-003 — ABDM registries (ABHA, HPR, HFR) behind mock adapters
*Status:* Accepted for HPR/HFR (2026-10-19), implemented in D-018. ABHA still Proposed.
*Decision:* One module per registry (`services/abha.py`, `hpr.py`, `hfr.py`), each with a `verify(id) -> dict | None` function reading a JSON fixture. Swap the body for the ABDM sandbox API later without touching callers.
*Why:* ABDM sandbox access needs registration/approval we may not get in time; the docx explicitly allows "mock files". Isolating it keeps the switch a one-file change.

## D-004 — Doctor verification is stored, not derived from user id
*Status:* Accepted (2026-10-19), implemented in D-018
*Decision:* Doctors enter their HPR registration number at sign-up; store `hpr_id` and `verified_at` on `users`. Only doctors with `verified_at` set can request records or upload verified documents. Delete the `user.id % 4` lookup.
*Why:* The current mapping marks doctors verified or not based on their row number — it is not verification. Once verified, the doctor never repeats it (docx: "once registered we need not repeat").

## D-005 — Labs are a role, verified as a facility via HFR
*Status:* Accepted (2026-10-19), implemented in D-018
*Decision:* Add `role = "lab"` with `hfr_id`. Only verified labs can upload lab reports; their uploads are tagged LAB.
*Why:* Docx: labs are verified as a facility, not a person, and lab reports are official documents.

## D-006 — Trust badge = uploader + review flag
*Status:* Proposed
*Decision:* `uploaded_by ∈ {PATIENT, DOCTOR, LAB}` plus `reviewed_by_doctor_id` / `reviewed_at` on `medical_reports`. Badge is computed: PATIENT → Unverified, DOCTOR → Verified, LAB → Verified Lab, any + reviewed → Doctor-reviewed.
*Why:* Matches the docx's four badges with two columns instead of a separate status table. Insurance summaries (D-012) include only non-PATIENT or reviewed records.

## D-007 — Upload requires type + date; OCR only pre-fills
*Status:* Proposed
*Decision:* Upload form requires file, record date and record type (OPD Visit Notes, Prescription, Lab Report, Procedure/Treatment Summary, Follow-up Notes, Surgery, Allergy); optional 1–2 line summary. OCR suggests date/type; the user confirms.
*Why:* Timeline, filters and relevance decay all depend on reliable date and type; OCR guesses are wrong often enough on handwritten prescriptions that they can't be the source of truth.

## D-008 — FHIR as an export format, not a storage engine
*Status:* Proposed
*Decision:* Keep relational storage. Add `GET /fhir/Patient/{id}/$everything` returning a FHIR R4 Bundle (Patient, DocumentReference per report, Observation per extracted vital). No FHIR server.
*Why:* Docx frames FHIR as "the storage & sharing format" for interoperability; producing valid FHIR JSON on the way out demonstrates that without running HAPI-FHIR.

## D-009 — Consent purposes aligned with the docx
*Status:* Proposed
*Decision:* Access purpose becomes a required enum: TREATMENT, SECOND_OPINION, EMERGENCY, INSURANCE (+ optional note). Reuse `AccessRequest` / `ActiveAccessSession`; add a patient-chosen duration and report count when granting.
*Why:* The consent machinery already exists; only the vocabulary and grant options need to match the docx.

## D-010 — Soft delete for records
*Status:* Proposed
*Decision:* Replace hard delete with `deleted_at`; deleted records hidden from all views, restorable by the patient for 30 days, then purged.
*Why:* Docx asks for "backup of deleted docs"; also keeps the audit trail and blockchain hash meaningful.

## D-011 — Misuse detection is rule-based and alerts, never blocks
*Status:* Proposed
*Decision:* Four rules over `access_logs`: >10 patients/hour per doctor; access 00:00–05:00 IST; access after consent expiry; delegate >20 views/day. Hits create an `alerts` row shown to the patient (and admin).
*Why:* Docx: "Trigger an alert (NOT a block)", "pick 3–4 rules max". Blocking would risk denying emergency care on a false positive.

## D-012 — Insurance / scheme sharing = one generated summary
*Status:* Proposed
*Decision:* Patient groups records into a "treatment episode", generates a summary (ABHA ID, hospital, diagnosis, dates, attached verified reports), and grants an `insurer` role read access to that summary only.
*Why:* Docx: "You are NOT building insurance systems… share only that summary, not full history."

## D-013 — Family mode: merge `janhavi_search`, don't rewrite
*Status:* Proposed — needs review of the branch first
*Decision:* Review and merge `origin/janhavi_search` (family router, profile switch). Extend it with permission checkboxes, temporary/permanent access, and "on behalf of" audit entries. From `feature/firebase-auth-notifications`, cherry-pick only `src/` + `public/firebase-messaging-sw.js`, never `node_modules/` or `dist/`.
*Why:* Existing teammate work covers part of the requirement; rewriting wastes it. The firebase branch is unmergeable as committed.

## D-014 — Patient features move to mobile; doctor features stay on web
*Status:* Proposed
*Decision:*
- **Mobile (patient):** login (ABHA/OTP), records timeline + filter chips, upload, consent inbox, active access + revoke, access history, emergency card (offline), family, trends, insurance summary.
- **Web (doctor/lab):** verification, scan QR / request access with purpose, view records, comment & mark reviewed, upload, patient snapshot, comparison, timeline with relevance decay.
*Why:* Matches the UX references (patient phone app) and how doctors actually work (desktop in OPD).

## D-015 — Mobile auth token in SecureStore
*Status:* Proposed
*Decision:* Store the JWT with `expo-secure-store`, not AsyncStorage.
*Why:* AsyncStorage is unencrypted; this is health data.

## D-016 — Out of scope for now
*Status:* Accepted
*Decision:* Docx "Future scope" items are deferred: medicine reminders, missed follow-up detector, chatbot, report simplifier, geo-fenced access, nearby ambulance/blood bank, doctor trust score.
*Why:* Core verification + consent + trust features come first; these depend on them.

## D-017 — Remove patient data from git
*Status:* Proposed — needs team agreement (rewrites history)
*Decision:* Untrack `backend/storage/`, `healthqr.db`, `frontend/.env`; add them to `.gitignore`; seed demo data from a script with synthetic reports.
*Why:* A privacy-first health app can't ship medical images in its repo. Purging them from history needs a force-push, so the team must agree.

## D-018 — How HPR/HFR verification was implemented
*Status:* Accepted (2026-10-19)
*Decision:*
- One mock registry module, `backend/app/services/registry.py`, reading `app/fixtures/hpr.json` and `hfr.json`. Not three modules as D-003 suggested: HPR and HFR lookups are the same code with a different file. ABHA is left out until patient login is built.
- Doctors and labs share one column pair on `users`: `registry_id` (unique; HPR for doctors, HFR for labs) and `verified_at`. No separate tables, because a user has exactly one registry ID.
- Sign-up as doctor/lab **requires** a registry ID that matches; unknown IDs are rejected (400) and IDs already linked to another account are rejected (409). This stops two accounts claiming one doctor.
- Existing doctor accounts (made before this change) have no ID, so they are blocked until they call `PUT /user/me/registry-id` once.
- The check sits in `require_role` (`deps.py`): any doctor/lab endpoint rejects unverified users. One place to enforce it, so new endpoints can't forget.
- Labs upload through `POST /reports/upload-by-lab` (same handler as `upload-by-doctor`); reports are tagged `uploaded_by = "LAB"`.
- Removed the `user.id % 4` profile lookup. The doctor directory now reads profile details (specialization, hospital) from the registry entry.
*Why:* This is the smallest change that makes "verified" mean "matched a registry entry". It also gives one place to swap in the real ABDM APIs later (`registry.lookup`).
*Known limit:* A verified lab can upload to any patient ID without that patient's consent. The upload is write-only and tagged LAB, so it can't leak data. This gets fixed when the lab flow adds a patient-issued lab order or QR.
*Check:* `cd backend && python verify_registry.py`
