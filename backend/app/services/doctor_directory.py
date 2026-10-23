from app.services.registry import lookup


def build_doctor_directory(users: list) -> list[dict]:
    directory = []
    ordered_users = sorted(users, key=lambda user: ((user.display_name or "").lower(), user.id))

    for user in ordered_users:
        profile = lookup("doctor", user.registry_id) if user.verified_at else None
        directory.append({
            "id": user.id,
            "name": user.display_name or f"Doctor {user.id}",
            "hpr_id": user.registry_id,
            "specialization": profile["specialization"] if profile else None,
            "hospital": profile["hospital"] if profile else None,
            "experience": profile["experience"] if profile else 0,
            "qualification": profile["qualification"] if profile else None,
            "verified": profile is not None,
        })

    return directory
