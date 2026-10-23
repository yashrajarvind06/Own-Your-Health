import { useEffect } from "react";

// The patient experience lives in the patient app (mobile/, served by the backend). Override with VITE_PATIENT_APP_URL,
// e.g. the public HTTPS tunnel address, when the backend isn't on this machine's port 8000.
export const PATIENT_APP_URL: string = import.meta.env.VITE_PATIENT_APP_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

/** Old patient web pages: send patients to the patient app, which has every feature (one app for phone and desktop). */
export default function PatientAppMoved() {
    useEffect(() => { window.location.replace(PATIENT_APP_URL); }, []);
    return (
        <div className="mx-auto max-w-lg py-16 text-center">
            <h2 className="text-xl font-bold text-gray-900">Opening the OwnYourHealth patient app…</h2>
            <p className="mt-2 text-gray-600">Patients now use one app on phone and desktop, with records timeline, family access, share links and more.</p>
            <a href={PATIENT_APP_URL} className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">Open the patient app</a>
        </div>
    );
}
