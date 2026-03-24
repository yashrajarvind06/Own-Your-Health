import { useAuth } from "../context/AuthContext";
import PatientProfileDropdown from "./PatientProfileDropdown";
import DoctorProfileDropdown from "./DoctorProfileDropdown";

export default function ProfileDropdown() {
    const { user } = useAuth();

    if (!user) return null;

    if (user.role === "doctor") {
        return <DoctorProfileDropdown />;
    }

    return <PatientProfileDropdown />;
}
