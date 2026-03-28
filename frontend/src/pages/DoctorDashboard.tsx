import { useEffect, useState } from "react";
import { ActiveSessionsList } from "../components/ActiveSessionsList";
import ScanQR from "./ScanQR"; // Helper Component
import DoctorNotifications from "../components/DoctorNotifications";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { api, apiForm } from "../api";
import { useSearchParams } from "react-router-dom";

function LockedFeatureCard({
  children,
  locked,
}: {
  children: React.ReactNode;
  locked: boolean;
}) {
  return (
    <div className="relative">
      <div className={locked ? "pointer-events-none opacity-50 grayscale-[0.2]" : ""}>
        {children}
      </div>
      {locked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 p-4">
          <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center shadow-sm">
            <div className="text-sm font-semibold text-amber-900">🔒 Locked - Verify to unlock</div>
            <div className="mt-1 text-sm text-amber-800">
              Only HPR-verified doctors can access patient data
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isVerifiedDoctor = Boolean(user?.verified);
  const [activePatients, setActivePatients] = useState<any[]>([]);
  const [historyPatients, setHistoryPatients] = useState<any[]>([]);
  const [uploadPatient, setUploadPatient] = useState<any | null>(null);
  const [doctorReportName, setDoctorReportName] = useState("");
  const [doctorReportFile, setDoctorReportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSessionSelect = (session: any) => {
    setPatientId(session.patient_id);
  };

  const handleSessionEnd = () => {
    setPatientId(null);
  };

  useEffect(() => {
    const param = searchParams.get("patientId");
    if (!param) {
      return;
    }
    const parsed = Number(param);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setPatientId(parsed);
    }
  }, [searchParams]);

  const loadPatients = async () => {
    try {
      const [active, history] = await Promise.all([
        api("/doctor/patients/active"),
        api("/doctor/patients/history"),
      ]);
      setActivePatients(Array.isArray(active) ? active : []);
      setHistoryPatients(Array.isArray(history) ? history.filter((item: any) => !item.is_active) : []);
    } catch (error) {
      console.error("Failed to load doctor patients", error);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [refreshKey]);

  const handleDoctorUpload = async () => {
    if (!uploadPatient || !doctorReportFile || !doctorReportName.trim()) {
      return;
    }

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("patient_id", String(uploadPatient.patient_id));
      fd.append("report_id", doctorReportName.trim());
      fd.append("file", doctorReportFile);
      await apiForm("/reports/upload-by-doctor", fd);
      setUploadPatient(null);
      setDoctorReportName("");
      setDoctorReportFile(null);
      await loadPatients();
      alert("Report uploaded successfully");
    } catch (error: any) {
      alert(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Doctor Workstation</h1>
          {isVerifiedDoctor && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
              ✔ Verified
            </span>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-5 ${isVerifiedDoctor ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`text-sm font-semibold ${isVerifiedDoctor ? "text-emerald-800" : "text-amber-800"}`}>
              {isVerifiedDoctor ? "Verified Professional Account" : "Verification Required"}
            </p>
            <h2 className={`mt-1 text-lg font-bold ${isVerifiedDoctor ? "text-emerald-900" : "text-amber-900"}`}>
              {isVerifiedDoctor ? "Your HPR ID has been verified. You can access patient records." : "Your account is not verified with HPR."}
            </h2>
          </div>
          {!isVerifiedDoctor && (
            <Button type="button" onClick={() => alert("Verification under review")}>
              Verify Now
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-8">
        <LockedFeatureCard locked={!isVerifiedDoctor}>
          <DoctorNotifications onActionComplete={() => setRefreshKey((value) => value + 1)} />
        </LockedFeatureCard>

        <LockedFeatureCard locked={!isVerifiedDoctor}>
          <ActiveSessionsList
            key={refreshKey}
            onSelect={handleSessionSelect}
            onSessionEnd={handleSessionEnd}
            currentPatientId={patientId}
          />
        </LockedFeatureCard>

        <LockedFeatureCard locked={!isVerifiedDoctor}>
          <div className="relative">
            <ScanQR initialPatientId={patientId} />
            {!isVerifiedDoctor && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled
                  title="Only HPR-verified doctors can access patient data"
                  className="bg-gray-300 text-gray-700 hover:bg-gray-300"
                >
                  🔒 Request Access
                </Button>
                <Button
                  type="button"
                  disabled
                  variant="secondary"
                  title="Only HPR-verified doctors can access patient data"
                  className="border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-100"
                >
                  🔒 View Patient Reports
                </Button>
              </div>
            )}
          </div>
        </LockedFeatureCard>

        <LockedFeatureCard locked={!isVerifiedDoctor}>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Active Patients</h2>
                <p className="mt-1 text-sm text-gray-500">Patients with currently active access.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {activePatients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No active patients yet.
                </div>
              ) : (
                activePatients.map((patient) => (
                  <div key={`active-${patient.patient_id}`} className="flex flex-col gap-3 rounded-lg border border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{patient.patient_name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Last accessed: {patient.last_accessed_at ? new Date(patient.last_accessed_at).toLocaleString() : "Unknown"}
                      </div>
                    </div>
                    <Button type="button" onClick={() => setUploadPatient(patient)}>
                      Upload Report
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </LockedFeatureCard>

        <LockedFeatureCard locked={!isVerifiedDoctor}>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Past Patients</h2>
                <p className="mt-1 text-sm text-gray-500">Previously accessed patients remain available for report uploads.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {historyPatients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No previously accessed patients yet.
                </div>
              ) : (
                historyPatients.map((patient) => (
                  <div key={`history-${patient.patient_id}`} className="flex flex-col gap-3 rounded-lg border border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{patient.patient_name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Last accessed: {patient.last_accessed_at ? new Date(patient.last_accessed_at).toLocaleString() : "Unknown"}
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setUploadPatient(patient)}>
                      Upload Report
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </LockedFeatureCard>
      </div>

      {uploadPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Upload Report for {uploadPatient.patient_name}</h3>
            <p className="mt-1 text-sm text-gray-500">Doctor uploads are allowed for active and previously accessed patients.</p>
            <div className="mt-4 space-y-3">
              <Input
                value={doctorReportName}
                onChange={(event) => setDoctorReportName(event.target.value)}
                placeholder="Report name"
              />
              <input
                type="file"
                onChange={(event) => setDoctorReportFile(event.target.files?.[0] || null)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setUploadPatient(null);
                  setDoctorReportName("");
                  setDoctorReportFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDoctorUpload}
                isLoading={uploading}
                disabled={uploading || !doctorReportFile || !doctorReportName.trim()}
              >
                Upload Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
