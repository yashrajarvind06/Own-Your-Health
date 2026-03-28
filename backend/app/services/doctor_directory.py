VALID_HPR_IDS = {
    "HPR1234567890",
    "HPR9876543210",
    "HPR5556667778",
}


DOCTOR_DIRECTORY_PROFILES = [
    {
        "hpr_id": "HPR1234567890",
        "specialization": "Internal Medicine",
        "hospital": "City Care Hospital",
        "experience": 14,
        "qualification": "MD Internal Medicine",
    },
    {
        "hpr_id": "HPR0000000001",
        "specialization": "Radiology",
        "hospital": "Metro Imaging Centre",
        "experience": 9,
        "qualification": "MD Radiodiagnosis",
    },
    {
        "hpr_id": "HPR9876543210",
        "specialization": "Cardiology",
        "hospital": "Sunrise Heart Institute",
        "experience": 11,
        "qualification": "DM Cardiology",
    },
    {
        "hpr_id": "HPR0000000002",
        "specialization": "General Medicine",
        "hospital": "Community Health Clinic",
        "experience": 5,
        "qualification": "MBBS, DNB Family Medicine",
    },
]


def verify_doctor(hpr_id: str) -> bool:
    return hpr_id in VALID_HPR_IDS


def get_doctor_profile(doctor_id: int) -> dict:
    index = (max(doctor_id, 1) - 1) % len(DOCTOR_DIRECTORY_PROFILES)
    return DOCTOR_DIRECTORY_PROFILES[index]


def build_doctor_directory(users: list) -> list[dict]:
    directory = []
    ordered_users = sorted(users, key=lambda user: ((user.display_name or "").lower(), user.id))

    for user in ordered_users:
        profile = get_doctor_profile(user.id)
        doctor = {
            "id": user.id,
            "name": user.display_name or f"Doctor {user.id}",
            "hpr_id": profile["hpr_id"],
            "specialization": profile["specialization"],
            "hospital": profile["hospital"],
            "experience": profile["experience"],
            "qualification": profile["qualification"],
        }
        doctor["verified"] = verify_doctor(doctor["hpr_id"])
        directory.append(doctor)

    return directory
