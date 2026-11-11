import os
import sys

# OCR debug prints carry arbitrary text; on Windows a cp1252 console/log would crash the request on it
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from fastapi import FastAPI, Request
from fastapi import HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from .services.file_urls import resolve_signed
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from sqlalchemy import text
from sqlalchemy.orm import Session

# Supabase publishes the public schema through its own REST API (roles anon/authenticated). Only this backend may
# touch the data: RLS on every table with no policies blocks those roles, while the table owner (the backend's
# login) bypasses RLS. Runs on every start so new tables are never exposed. No-op where those roles don't exist.
LOCK_DOWN_PUBLIC_TABLES = """
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
"""
from fastapi import Depends
from .routers import auth, qr, access, emergency, reports, logs, users, patient_history, patient_report_log, report_access, doctors
from .routers import auth, qr, access, emergency, reports, logs, users, patient_history, patient_report_log, report_access, emergency_qr, family, fhir, alerts, share, health_summary


def create_app() -> FastAPI:
    app = FastAPI(
        title="Patient-Owned Digital Health Record System",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json"
    )

    try:
        Base.metadata.create_all(bind=engine)

        # --- AUTO MIGRATION START ---
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE otp_codes ALTER COLUMN phone TYPE VARCHAR(255)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS registry_id VARCHAR(50)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_registry_id ON users (registry_id)"))
                for col in ("phone VARCHAR(20)", "phone_verified_at TIMESTAMP", "abha_number VARCHAR(20)", "abha_address VARCHAR(100)",
                            "abha_verified_at TIMESTAMP", "health_alerts_enabled BOOLEAN DEFAULT FALSE NOT NULL"):
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col}"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users (phone)"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_abha ON users (abha_number)"))
                for col in ("uploaded_by_user_id INTEGER REFERENCES users(id)", "record_type VARCHAR(50)", "user_summary VARCHAR(280)", "weight INTEGER",
                            "temperature VARCHAR(10)", "reviewed_by INTEGER REFERENCES users(id)", "reviewed_at TIMESTAMP", "deleted_at TIMESTAMP"):
                    conn.execute(text(f"ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS {col}"))
                conn.execute(text("ALTER TABLE active_access_sessions ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'CONSENT' NOT NULL"))
                conn.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS access_reason VARCHAR(50) DEFAULT 'UNKNOWN'"))
                conn.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS reason_note TEXT"))
                conn.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS request_source VARCHAR(20) DEFAULT 'QR'"))
                conn.execute(text("UPDATE access_requests SET request_source = 'QR' WHERE request_source IS NULL"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS extracted_text TEXT"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS summary VARCHAR(255)"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS bp_systolic INTEGER"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS bp_diastolic INTEGER"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS heart_rate INTEGER"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS glucose INTEGER"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS report_date TIMESTAMP"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS ai_summary VARCHAR(300)"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS ai_details JSON"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS ai_status VARCHAR(12)"))
                # a restart drops queued summaries, and FAILED means Gemini was down: queue both again
                conn.execute(text("UPDATE medical_reports SET ai_status = NULL WHERE ai_status IN ('PENDING', 'FAILED')"))
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(20) DEFAULT 'PATIENT' NOT NULL"))
                conn.execute(text("UPDATE medical_reports SET uploaded_by = 'PATIENT' WHERE uploaded_by IS NULL"))
                
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS emergency_qr_profiles (
                        id SERIAL PRIMARY KEY,
                        patient_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
                        name VARCHAR(255),
                        phone VARCHAR(50),
                        emergency_contact VARCHAR(255),
                        date_of_birth VARCHAR(20),
                        age INTEGER,
                        gender VARCHAR(20),
                        blood_group VARCHAR(10),
                        chronic_conditions TEXT,
                        medications TEXT,
                        surgeries TEXT,
                        allergies TEXT,
                        organ_donor_status VARCHAR(10),
                        organ_donor_details TEXT,
                        pregnancy_status VARCHAR(50),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                """))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(20)"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS age INTEGER"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20)"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS chronic_conditions TEXT"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS organ_donor_status VARCHAR(10)"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS organ_donor_details TEXT"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS pregnancy_status VARCHAR(50)"))
                conn.execute(text("ALTER TABLE emergency_qr_profiles ADD COLUMN IF NOT EXISTS card_token VARCHAR(64)"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_emergency_card_token ON emergency_qr_profiles (card_token)"))
                conn.commit()
                print("SUCCESS: schema migrations applied.")
        except Exception as mig_err:
            print(f"WARNING: Migration step failed (might already exist): {mig_err}")
        # --- AUTO MIGRATION END ---
        try:
            with engine.begin() as conn:
                conn.execute(text(LOCK_DOWN_PUBLIC_TABLES))
            print("SUCCESS: public tables locked to the backend (RLS on, no API-role grants).")
        except Exception as lock_err:
            print(f"ERROR: could not lock down public tables, data may be exposed: {lock_err}")

    except Exception as e:
        print(f"Warning: Database tables may already exist. Startup continued. Error: {e}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    os.makedirs("storage", exist_ok=True)

    # Report files are only reachable through short-lived signed links (see services/file_urls.py)
    @app.get("/api/files/{key:path}")
    def get_signed_file(key: str, exp: int, sig: str):
        path = resolve_signed(key, exp, sig)
        if not path:
            raise HTTPException(status_code=403, detail="Link expired or invalid")
        return FileResponse(path)

    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(qr.router, prefix="/qr", tags=["qr"])
    app.include_router(access.router, prefix="/access", tags=["access"])
    app.include_router(emergency.router, prefix="/emergency", tags=["emergency"])
    app.include_router(emergency_qr.router, prefix="/api/emergency-qr", tags=["emergency-qr"])
    app.include_router(reports.router, prefix="/reports", tags=["reports"])
    app.include_router(logs.router, prefix="/logs", tags=["logs"])
    app.include_router(users.router, prefix="/user", tags=["user"])
    app.include_router(doctors.router, tags=["doctors"])
    app.include_router(family.router, prefix="/family", tags=["family"])
    app.include_router(fhir.router, prefix="/fhir", tags=["fhir"])
    app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
    # not "/share": that path is the PWA's share screen, and API routes win over page loads
    app.include_router(share.router, prefix="/share-links", tags=["share"])
    app.include_router(health_summary.router, prefix="/health-summary", tags=["health-summary"])
    # app.include_router(access_profile.router, prefix="/patient", tags=["patient_access_profile"]) # Not found in fs
    app.include_router(patient_history.router, prefix="/patient/access", tags=["patient_history"])
    app.include_router(patient_report_log.router, prefix="/patient/reports", tags=["patient_report_log"])
    app.include_router(report_access.router, prefix="/access/reports", tags=["report_access"])

    @app.get("/health/db")
    def check_db(db: Session = Depends(get_db)):
        try:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            return {"status": "ok", "database": "connected"}
        except Exception as e:
            return {"status": "error", "database": str(e)}

    # Patient PWA (built with `npm run build:web` in mobile/), served on the API's own origin.
    # Registered last: only paths no API route matched get here.
    web_dir = Path(os.getenv("WEB_APP_DIR", Path(__file__).resolve().parents[2] / "mobile" / "dist")).resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def patient_web_app(path: str, request: Request):
        if not (web_dir / "index.html").is_file():
            if path == "":
                return {"message": "Backend is running successfully!"}
            raise HTTPException(status_code=404, detail="Not Found")
        file = (web_dir / path).resolve()
        if path and web_dir in file.parents and file.is_file():
            return FileResponse(file)
        # App routes (/records, /family/21…) are client-side, but only page loads get the shell:
        # /family and /access are API prefixes too, so an unknown API call must still 404.
        if "text/html" not in request.headers.get("accept", ""):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(web_dir / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
