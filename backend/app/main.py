import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from sqlalchemy.orm import Session
from fastapi import Depends
from .routers import auth, qr, access, emergency, reports, logs, users, patient_history, patient_report_log, report_access, emergency_qr


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
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)"))
                conn.execute(text("ALTER TABLE active_access_sessions ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'CONSENT' NOT NULL"))
                conn.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS access_reason VARCHAR(50) DEFAULT 'UNKNOWN'"))
                conn.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS reason_note TEXT"))
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
                conn.commit()
                print("SUCCESS: schema migrations applied.")
        except Exception as mig_err:
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
    app.include_router(emergency_qr.router, prefix="/api/emergency-qr", tags=["emergency-qr"])
    app.include_router(reports.router, prefix="/reports", tags=["reports"])
    app.include_router(logs.router, prefix="/logs", tags=["logs"])
    app.include_router(users.router, prefix="/user", tags=["user"])
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
