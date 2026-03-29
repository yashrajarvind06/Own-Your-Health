import { useEffect, useMemo, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useSearchParams } from "react-router-dom";
import { Clock3, FileText, QrCode, ScanLine, ShieldCheck, Upload, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, apiForm } from "../api";
import DoctorNotifications from "../components/DoctorNotifications";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

type ActiveSession = {
  patient_id: number;
  patient_name: string;
  expires_at: string;
  remaining_seconds: number;
  access_mode: string;
};

type PatientHistoryRow = {
  patient_id: number;
  patient_name: string;
  last_accessed_at?: string | null;
  is_active: boolean;
};

type Snapshot = {
  blood_group?: string | null;
  allergies?: string[] | string | null;
};

type ReportFilter = "ALL" | "UNLOCKED" | "EXPIRED" | "LOCKED";
type ReportStatus = "UNLOCKED" | "EXPIRED" | "REVOKED" | "LOCKED";

type ReportRow = {
  id: number;
  filename: string;
  summary?: string | null;
  created_at?: string;
  uploaded_by?: "PATIENT" | "DOCTOR";
  status: ReportStatus;
  requested: boolean;
};

type Toast = { message: string; tone: "success" | "error" } | null;

const FILTERS: { id: ReportFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "UNLOCKED", label: "Unlocked" },
  { id: "EXPIRED", label: "Expired" },
  { id: "LOCKED", label: "Locked" },
];

function fmtRemaining(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "Expired";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, "0")}s left` : `${secs}s left`;
}

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function parseAllergies(value: Snapshot["allergies"]) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

function statusTone(status: ReportStatus) {
  if (status === "UNLOCKED") return "bg-emerald-100 text-emerald-700";
  if (status === "EXPIRED") return "bg-gray-100 text-gray-600";
  if (status === "REVOKED") return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isVerifiedDoctor = Boolean(user?.verified);

  const [toast, setToast] = useState<Toast>(null);
  const [scanning, setScanning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [historyPatients, setHistoryPatients] = useState<PatientHistoryRow[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>("ALL");
  const [uploadPatient, setUploadPatient] = useState<{ patient_id: number; patient_name: string } | null>(null);
  const [doctorReportName, setDoctorReportName] = useState("");
  const [doctorReportFile, setDoctorReportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectedSession = useMemo(
    () => activeSessions.find((row) => row.patient_id === selectedPatientId) ?? null,
    [activeSessions, selectedPatientId]
  );
  const sessionActive = Boolean(selectedSession && selectedSessionId && selectedSession.remaining_seconds > 0);
  const allergies = parseAllergies(snapshot?.allergies);

  const filteredReports = useMemo(() => {
    if (filter === "ALL") return reports;
    if (filter === "LOCKED") return reports.filter((row) => row.status === "LOCKED" || row.status === "REVOKED");
    return reports.filter((row) => row.status === filter);
  }, [filter, reports]);

  function pushToast(message: string, tone: "success" | "error" = "success") {
    setToast({ message, tone });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadActiveSessions() {
    try {
      const res = await api("/access/sessions/active");
      const rows = Array.isArray(res) ? res.filter((row: ActiveSession) => Number(row.remaining_seconds) > 0) : [];
      setActiveSessions(rows);
      setSelectedPatientId((current) => {
        const requested = Number(searchParams.get("patientId"));
        if (requested && rows.some((row: ActiveSession) => row.patient_id === requested)) return requested;
        if (current && rows.some((row: ActiveSession) => row.patient_id === current)) return current;
        return rows[0]?.patient_id ?? null;
      });
    } catch (error: any) {
      pushToast(error.message || "Failed to load active patients", "error");
    }
  }

  async function loadHistoryPatients() {
    try {
      const res = await api("/doctor/patients/history");
      setHistoryPatients(Array.isArray(res) ? res.filter((row: PatientHistoryRow) => !row.is_active) : []);
    } catch (error: any) {
      pushToast(error.message || "Failed to load past patients", "error");
    }
  }

  async function loadSessionStatus(patientId: number) {
    try {
      const res = await api(`/access/session/status?patient_id=${patientId}`);
      const row = Array.isArray(res) ? res[0] : res;
      if (!row || row.status !== "GRANTED" || !row.id) {
        setSelectedSessionId(null);
        setReports([]);
        return null;
      }
      setSelectedSessionId(row.id);
      return Number(row.id);
    } catch (error: any) {
      setSelectedSessionId(null);
      pushToast(error.message || "Failed to load session status", "error");
      return null;
    }
  }

  async function loadSnapshot(patientId: number) {
    try {
      const res = await api(`/emergency/profile?patient_id=${patientId}`, {
        headers: { "X-Access-Intent": "EMERGENCY_VIEW" },
      });
      setSnapshot({ blood_group: res?.blood_group ?? null, allergies: res?.allergies ?? null });
    } catch {
      setSnapshot(null);
    }
  }

  async function loadReports(patientId: number, sessionId: number) {
    setReportsLoading(true);
    try {
      const [listRes, activeRes, revokedRes, requestsRes] = await Promise.all([
        api(`/reports/list?patient_id=${patientId}`),
        api(`/access/reports/active?session_id=${sessionId}`),
        api(`/access/reports/revoked?session_id=${sessionId}`),
        api(`/access/reports/requests?session_id=${sessionId}`),
      ]);
      const activeIds = new Set<number>(Array.isArray(activeRes) ? activeRes.map((row: any) => Number(row.report_id)) : []);
      const revokedIds = new Set<number>(Array.isArray(revokedRes) ? revokedRes.map((row: any) => Number(row.report_id)) : []);
      const requestMap = new Map<number, string>();
      if (Array.isArray(requestsRes)) {
        requestsRes.forEach((row: any) => requestMap.set(Number(row.report_id), String(row.status || "").toUpperCase()));
      }

      const mapped: ReportRow[] = Array.isArray(listRes)
        ? listRes.map((row: any) => {
            const requestStatus = requestMap.get(Number(row.id));
            let status: ReportStatus = "LOCKED";
            if (revokedIds.has(Number(row.id))) status = "REVOKED";
            else if (activeIds.has(Number(row.id))) status = "UNLOCKED";
            else if (requestStatus === "APPROVED") status = "EXPIRED";
            return {
              id: Number(row.id),
              filename: row.filename,
              summary: row.summary,
              created_at: row.created_at,
              uploaded_by: row.uploaded_by,
              status,
              requested: requestStatus === "PENDING" || requestStatus === "REQUESTED",
            };
          })
        : [];
      setReports(mapped);
    } catch (error: any) {
      setReports([]);
      pushToast(error.message || "Failed to load reports", "error");
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    loadActiveSessions();
    loadHistoryPatients();
    const interval = window.setInterval(() => {
      loadActiveSessions();
      loadHistoryPatients();
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedSessionId(null);
      setSnapshot(null);
      setReports([]);
      return;
    }
    let cancelled = false;
    async function refreshWorkspace() {
      const sid = await loadSessionStatus(selectedPatientId);
      if (cancelled || !sid) {
        if (!cancelled) {
          setSnapshot(null);
          setReports([]);
        }
        return;
      }
      await Promise.all([loadSnapshot(selectedPatientId), loadReports(selectedPatientId, sid)]);
    }
    refreshWorkspace();
    const interval = window.setInterval(refreshWorkspace, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) return;
    if (!activeSessions.some((row) => row.patient_id === selectedPatientId)) {
      setSelectedSessionId(null);
      setSnapshot(null);
      setReports([]);
      setSelectedPatientId(activeSessions[0]?.patient_id ?? null);
    }
  }, [activeSessions, selectedPatientId]);

  async function handleScannedToken(token: string) {
    try {
      setValidating(true);
      const validateRes = await api("/qr/validate", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      const patientId = Number(validateRes?.patient_id);
      if (!validateRes?.valid || !patientId) throw new Error("QR expired or invalid");
      setRequesting(true);
      await api("/access/request-v2", {
        method: "POST",
        body: JSON.stringify({
          token,
          patient_id: patientId,
          access_context: "NORMAL",
          access_reason: "FOLLOW_UP",
          reason_note: null,
        }),
      });
      setSelectedPatientId(patientId);
      pushToast("Access request sent. Waiting for patient approval.");
      await loadActiveSessions();
    } catch (error: any) {
      pushToast(error.message || "Failed to request access", "error");
    } finally {
      setScanning(false);
      setValidating(false);
      setRequesting(false);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    const id = "doctor-qr-reader";
    const element = document.getElementById(id);
    if (!element) return;
    element.innerHTML = "";
    const scanner = new Html5QrcodeScanner(
      id,
      { fps: 20, qrbox: { width: 240, height: 240 }, aspectRatio: 1, showTorchButtonIfSupported: true, videoConstraints: { facingMode: "environment" } },
      false
    );
    scanner.render(
      async (decodedText) => {
        await scanner.clear();
        handleScannedToken(decodedText);
      },
      () => {}
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [scanning]);

  async function handleEndSession(patientId: number) {
    try {
      await api("/access/revoke", {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId, reason: "Doctor ended session" }),
      });
      if (selectedPatientId === patientId) {
        setSelectedPatientId(null);
        setSelectedSessionId(null);
        setSnapshot(null);
        setReports([]);
      }
      pushToast("Session ended successfully.");
      await loadActiveSessions();
      await loadHistoryPatients();
    } catch (error: any) {
      pushToast(error.message || "Failed to end session", "error");
    }
  }

  async function handleOpenReport(reportId: number) {
    if (!sessionActive) return pushToast("Session expired. Scan again to continue.", "error");
    try {
      const res = await api("/reports/access", {
        method: "POST",
        body: JSON.stringify({ report_ids: [reportId], access_mode: "NORMAL" }),
      });
      const url = Array.isArray(res) ? res[0]?.url : null;
      if (!url) throw new Error("Report URL unavailable");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      pushToast(error.message || "Failed to open report", "error");
    }
  }

  async function handleRequestReportAccess(reportId: number) {
    if (!selectedSessionId || !sessionActive) return pushToast("Session expired. Scan again to continue.", "error");
    try {
      await api("/access/reports/request", {
        method: "POST",
        body: JSON.stringify({ session_id: selectedSessionId, report_id: reportId, reason: "FOLLOW_UP" }),
      });
      setReports((current) => current.map((row) => (row.id === reportId ? { ...row, requested: true } : row)));
      pushToast("Report access requested.");
    } catch (error: any) {
      pushToast(error.message || "Failed to request report access", "error");
    }
  }

  async function handleDoctorUpload() {
    if (!uploadPatient || !doctorReportFile || !doctorReportName.trim()) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("patient_id", String(uploadPatient.patient_id));
      fd.append("report_id", doctorReportName.trim());
      fd.append("file", doctorReportFile);
      await apiForm("/reports/upload-by-doctor", fd);
      pushToast("Report uploaded successfully.");
      setUploadPatient(null);
      setDoctorReportName("");
      setDoctorReportFile(null);
      await Promise.all([loadActiveSessions(), loadHistoryPatients()]);
      if (selectedPatientId === uploadPatient.patient_id && selectedSessionId) {
        await loadReports(uploadPatient.patient_id, selectedSessionId);
      }
    } catch (error: any) {
      pushToast(error.message || "Failed to upload report", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {toast && (
        <div className="fixed right-4 top-20 z-50">
          <div className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {toast.message}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Doctor Workstation</h1>
        {isVerifiedDoctor && (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Verified
          </span>
        )}
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
          {!isVerifiedDoctor && <Button onClick={() => pushToast("Verification under review.")}>Verify Now</Button>}
        </div>
      </div>

      <DoctorNotifications onActionComplete={() => { loadActiveSessions(); loadHistoryPatients(); }} />

      <div className="grid gap-6 lg:grid-cols-[30%_70%]">
        <div className="space-y-6">
          <Card title="Scan Patient QR" description="Use the camera to validate a patient QR and start the access request flow.">
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-5">
                {!scanning ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <QrCode className="h-7 w-7" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Scan Patient QR</h3>
                    <p className="mt-2 max-w-xs text-sm text-gray-500">QR validation and access request happen from one action flow with no manual inputs.</p>
                    <Button className="mt-5 w-full" onClick={() => setScanning(true)} disabled={!isVerifiedDoctor || validating || requesting}>
                      <ScanLine className="mr-2 h-4 w-4" />
                      Start Camera Scan
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div id="doctor-qr-reader" className="w-full" />
                    <Button variant="outline" className="mt-4 w-full" onClick={() => setScanning(false)}>Stop Scan</Button>
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <div className="flex items-center gap-2 font-medium text-gray-800">
                  <Clock3 className="h-4 w-4" />
                  Status
                </div>
                <div className="mt-2">
                  {validating ? "Validating QR code..." : requesting ? "Sending access request..." : sessionActive ? "Active session ready." : "Waiting for scan."}
                </div>
              </div>
              {!isVerifiedDoctor && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Only HPR-verified doctors can access patient data.
                </div>
              )}
            </div>
          </Card>

          {sessionActive && selectedSession && (
            <Card title="Patient Snapshot" description="Quick reference for the currently active patient.">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{selectedSession.patient_name}</div>
                    <div className="text-sm text-gray-500">Session live</div>
                  </div>
                </div>
                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Session timer</div>
                  <div className="mt-1 text-lg font-bold text-blue-900">{fmtRemaining(selectedSession.remaining_seconds)}</div>
                </div>
                {snapshot?.blood_group && (
                  <div className="rounded-xl border border-gray-200 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Blood group</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{snapshot.blood_group}</div>
                  </div>
                )}
                {allergies.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-red-700">Allergies</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {allergies.map((item) => (
                        <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Active Patients" description="Real-time sessions refresh automatically every five seconds.">
            <div className="space-y-3">
              {activeSessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  Scan a patient QR to start a session.
                </div>
              ) : (
                activeSessions.map((session) => (
                  <div key={session.patient_id} className={`flex flex-col gap-4 rounded-xl border px-4 py-4 lg:flex-row lg:items-center lg:justify-between ${session.patient_id === selectedPatientId ? "border-blue-200 bg-blue-50/60" : "border-gray-200 bg-white"}`}>
                    <button type="button" className="flex-1 text-left" onClick={() => setSelectedPatientId(session.patient_id)}>
                      <div className="font-semibold text-gray-900">{session.patient_name}</div>
                      <div className="mt-1 text-sm text-gray-500">{fmtRemaining(session.remaining_seconds)}</div>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={session.patient_id === selectedPatientId ? "primary" : "outline"} onClick={() => setSelectedPatientId(session.patient_id)}>View Reports</Button>
                      <Button size="sm" variant="secondary" onClick={() => setUploadPatient({ patient_id: session.patient_id, patient_name: session.patient_name })}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Report
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleEndSession(session.patient_id)}>
                        End Session
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Reports Workspace" description="A minimal, horizontal workspace for the selected active patient.">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${filter === item.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              {!sessionActive || !selectedPatientId ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                  Select an active patient to load reports.
                </div>
              ) : reportsLoading ? (
                <div className="rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">Loading reports...</div>
              ) : filteredReports.length === 0 ? (
                <div className="rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">No reports match the selected filter.</div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((report) => (
                    <div key={report.id} className="flex flex-col gap-4 rounded-xl border border-gray-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">{report.filename}</div>
                          {report.summary && <div className="mt-1 truncate text-sm text-gray-500">{report.summary}</div>}
                          <div className="mt-1 text-xs text-gray-400">{report.created_at ? new Date(report.created_at).toLocaleDateString() : "Date unavailable"}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-3 lg:items-end">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(report.status)}`}>
                            {report.status === "UNLOCKED" ? "Unlocked" : report.status === "EXPIRED" ? "Expired" : report.status === "REVOKED" ? "Revoked" : "Locked"}
                          </span>
                          {report.requested && report.status === "LOCKED" && (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Requested</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {report.status === "UNLOCKED" ? (
                            <Button size="sm" onClick={() => handleOpenReport(report.id)} disabled={!sessionActive}>View</Button>
                          ) : report.status === "LOCKED" ? (
                            <Button size="sm" variant="outline" onClick={() => handleRequestReportAccess(report.id)} disabled={!sessionActive || report.requested}>
                              {report.requested ? "Requested" : "Request Access"}
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" disabled>{report.status === "REVOKED" ? "Revoked" : "Expired"}</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card title="Past Patients" description="Previously accessed patients remain available for follow-up uploads.">
            <div className="space-y-3">
              {historyPatients.length === 0 ? (
                <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No past patients yet.</div>
              ) : (
                historyPatients.map((patient) => (
                  <div key={patient.patient_id} className="flex flex-col gap-3 rounded-xl border border-gray-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{patient.patient_name}</div>
                      <div className="mt-1 text-sm text-gray-500">Last accessed: {fmtDate(patient.last_accessed_at)}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setUploadPatient({ patient_id: patient.patient_id, patient_name: patient.patient_name })}>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Report
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {uploadPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Upload Report for {uploadPatient.patient_name}</h3>
            <p className="mt-1 text-sm text-gray-500">Reports can be uploaded for active and previously accessed patients.</p>
            <div className="mt-4 space-y-3">
              <Input value={doctorReportName} onChange={(event) => setDoctorReportName(event.target.value)} placeholder="Report name" />
              <input type="file" onChange={(event) => setDoctorReportFile(event.target.files?.[0] || null)} className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setUploadPatient(null); setDoctorReportName(""); setDoctorReportFile(null); }}>Cancel</Button>
              <Button onClick={handleDoctorUpload} isLoading={uploading} disabled={uploading || !doctorReportFile || !doctorReportName.trim()}>
                Upload Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
