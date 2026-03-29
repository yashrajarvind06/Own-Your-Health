import argparse
from pathlib import Path

import pandas as pd

from app.database import SessionLocal
from app.models import MedicalReport


def export_patient_trends(patient_id: int, output_path: str = "patient_trends.csv") -> Path:
    db = SessionLocal()
    try:
        reports = db.query(MedicalReport).filter(
            MedicalReport.patient_id == patient_id
        ).order_by(MedicalReport.created_at.asc()).all()

        rows = []
        for report in reports:
            bp_systolic = int(report.bp_systolic) if report.bp_systolic is not None else None
            bp_diastolic = int(report.bp_diastolic) if report.bp_diastolic is not None else None
            heart_rate = int(report.heart_rate) if report.heart_rate is not None else None
            glucose = int(report.glucose) if report.glucose is not None else None

            if all(value is None for value in [bp_systolic, bp_diastolic, heart_rate, glucose]):
                continue

            rows.append({
                "date": report.created_at.date().isoformat() if report.created_at else None,
                "bp_systolic": bp_systolic,
                "bp_diastolic": bp_diastolic,
                "heart_rate": heart_rate,
                "glucose": glucose,
            })

        dataframe = pd.DataFrame(
            rows,
            columns=["date", "bp_systolic", "bp_diastolic", "heart_rate", "glucose"],
        )
        export_target = Path(output_path)
        dataframe.to_csv(export_target, index=False)
        return export_target
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export OCR-derived patient trend metrics to CSV.")
    parser.add_argument("patient_id", type=int, help="Patient ID to export")
    parser.add_argument("--output", default="patient_trends.csv", help="CSV output path")
    args = parser.parse_args()

    destination = export_patient_trends(args.patient_id, args.output)
    print(f"Exported trends to {destination}")
