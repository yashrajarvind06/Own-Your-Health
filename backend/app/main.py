import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends
from .routers import auth, qr, access, emergency, reports, logs, users, patient_history, patient_report_log, report_access, doctors

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
        # Force add the column if it's missing (Safe for restart)
        try:
            with engine.connect() as conn:
                # 1. Users Display Name
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)"))
                # 2. Active Access Sessions Created Via
                conn.execute(text("ALTER TABLE active_access_sessions ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'CONSENT' NOT NULL"))

                # 3. Access Request Reason (Phase 2)
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
                conn.execute(text("ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(20) DEFAULT 'PATIENT' NOT NULL"))
                conn.execute(text("UPDATE medical_reports SET uploaded_by = 'PATIENT' WHERE uploaded_by IS NULL"))
                
                conn.commit()
                print("SUCCESS: schema migrations applied.")
        except Exception as mig_err:
             # Ignore if it fails (e.g. generic error), but print it
            print(f"WARNING: Migration step failed (might already exist): {mig_err}")
        # --- AUTO MIGRATION END ---

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
    app.mount("/api/static", StaticFiles(directory="storage"), name="static")

    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(qr.router, prefix="/qr", tags=["qr"])
    app.include_router(access.router, prefix="/access", tags=["access"])
    app.include_router(emergency.router, prefix="/emergency", tags=["emergency"])

    app.include_router(reports.router, prefix="/reports", tags=["reports"])
    app.include_router(logs.router, prefix="/logs", tags=["logs"])
    app.include_router(users.router, prefix="/user", tags=["user"])
    app.include_router(doctors.router, tags=["doctors"])
    # app.include_router(access_profile.router, prefix="/patient", tags=["patient_access_profile"]) # Not found in fs
    app.include_router(patient_history.router, prefix="/patient/access", tags=["patient_history"])
    app.include_router(patient_report_log.router, prefix="/patient/reports", tags=["patient_report_log"])
    app.include_router(report_access.router, prefix="/access/reports", tags=["report_access"])
    



    @app.get("/")
    def read_root():
        return {"message": "Backend is running successfully!"}

    @app.get("/health/db")
    def check_db(db: Session = Depends(get_db)):
        try:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            return {"status": "ok", "database": "connected"}
        except Exception as e:
            return {"status": "error", "database": str(e)}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
