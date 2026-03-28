import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from sqlalchemy.orm import Session
from fastapi import Depends
from .routers import auth, qr, access, emergency, reports, logs, users, patient_history, patient_report_log, report_access, family, profile_switch

def create_app() -> FastAPI:
    app = FastAPI(
        title="Patient-Owned Digital Health Record System",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json"
    )

    # --- AUTO MIGRATION START ---
    try:
        from sqlalchemy import text
        statements = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)",
            "ALTER TABLE active_access_sessions ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'CONSENT' NOT NULL",
            "ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS access_reason VARCHAR(50) DEFAULT 'UNKNOWN'",
            "ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS reason_note TEXT",
            "ALTER TABLE family_members ADD COLUMN phone_number VARCHAR(50) DEFAULT ''",
            "ALTER TABLE family_members ADD COLUMN linked_user_id INTEGER",
            """
            CREATE TABLE IF NOT EXISTS family_account_access_links_v1 (
                id SERIAL PRIMARY KEY,
                owner_user_id INTEGER NOT NULL REFERENCES users(id),
                target_user_id INTEGER NOT NULL REFERENCES users(id),
                member_name VARCHAR(255) NOT NULL,
                relationship VARCHAR(100) NOT NULL,
                member_email VARCHAR(255) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                verified_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
            )
            """,
        ]

        for statement in statements:
            try:
                with engine.begin() as conn:
                    conn.execute(text(statement))
            except Exception:
                pass

        print("SUCCESS: schema migrations applied.")
    except Exception as mig_err:
        print(f"WARNING: Migration step failed: {mig_err}")
    # --- AUTO MIGRATION END ---

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
    # app.include_router(access_profile.router, prefix="/patient", tags=["patient_access_profile"]) # Not found in fs
    app.include_router(patient_history.router, prefix="/patient/access", tags=["patient_history"])
    app.include_router(patient_report_log.router, prefix="/patient/reports", tags=["patient_report_log"])
    app.include_router(report_access.router, prefix="/access/reports", tags=["report_access"])
    app.include_router(family.router, prefix="/family", tags=["family"])
    app.include_router(profile_switch.router)
    



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
