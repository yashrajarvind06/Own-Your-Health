"""Self-check for HPR/HFR registry verification. Run: python verify_registry.py (uses in-memory SQLite)."""
import os
os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import User
from app.schemas import RegisterRequest
from app.routers.auth import register
from app.deps import require_role
from app.services.registry import verify_user

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()


def status_of(fn):
    try:
        fn()
    except HTTPException as e:
        db.rollback()
        return e.status_code
    return 200


def reg(email, role, registry_id=None):
    return register(RegisterRequest(email=email, password="x", role=role, registry_id=registry_id), db)


# doctor/lab must match the registry; patients need nothing
assert status_of(lambda: reg("p@x.com", "patient")) == 200
assert status_of(lambda: reg("d0@x.com", "doctor")) == 400
assert status_of(lambda: reg("d1@x.com", "doctor", "HPR0000000000")) == 400
assert status_of(lambda: reg("d2@x.com", "doctor", " hpr1234567890 ")) == 200
assert status_of(lambda: reg("d3@x.com", "doctor", "HPR1234567890")) == 409  # ID already claimed
assert status_of(lambda: reg("l1@x.com", "lab", "HPR9876543210")) == 400     # lab needs an HFR ID
assert status_of(lambda: reg("l2@x.com", "lab", "HFR1000000001")) == 200
assert db.query(User).filter(User.email.in_(["d0@x.com", "d1@x.com", "d3@x.com"])).count() == 0

doctor = db.query(User).filter(User.email == "d2@x.com").one()
assert doctor.registry_id == "HPR1234567890" and doctor.verified_at

# unverified doctor (legacy account) is blocked until linked
legacy = User(email="old@x.com", hashed_password="x", role="doctor")
db.add(legacy); db.commit()
guard = require_role("doctor", "lab")
assert status_of(lambda: guard(legacy)) == 403
assert status_of(lambda: guard(doctor)) == 200
assert status_of(lambda: guard(db.query(User).filter(User.email == "l2@x.com").one())) == 200
assert status_of(lambda: require_role("doctor")(db.query(User).filter(User.email == "p@x.com").one())) == 403
verify_user(db, legacy, "HPR9876543210"); db.commit()
assert status_of(lambda: guard(legacy)) == 200

print("registry verification: all checks passed")
