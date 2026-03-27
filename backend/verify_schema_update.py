import sys
from app.database import engine, Base
from app.models import EmergencyToken
from sqlalchemy import inspect

print("Running create_all...")
Base.metadata.create_all(bind=engine)

insp = inspect(engine)
if "emergency_tokens" in insp.get_table_names():
    print("SUCCESS: table 'emergency_tokens' exists.")
    columns = insp.get_columns("emergency_tokens")
    for col in columns:
        print(f"Col: {col['name']} ({col['type']})")
else:
    print("ERROR: table missing.")
