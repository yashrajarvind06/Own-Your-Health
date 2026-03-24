import sys
import os

# Adds the backend directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.database import engine, Base
from app.models import ReportAccess

def migrate():
    print("Migrating ReportAccess table...")
    ReportAccess.__table__.create(bind=engine, checkfirst=True)
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
