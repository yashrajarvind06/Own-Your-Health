import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Clock3, Inbox, LogOut, QrCode, ScanLine, ScrollText, Search, ShieldCheck, Upload, UserRound, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, apiForm } from "../api";
import DoctorNotifications from "../components/DoctorNotifications";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import DoctorReportList from "../components/DoctorReportList";
import { PatientSummaryPanel } from "../components/DoctorRecordTools";
import { ACCESS_PURPOSES } from "../purposes";
import TrustPanel from "../components/TrustPanel";

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

type Outgoing = { id: number; patient_id: number; patient_name: string; access_reason: string | null };
type Summary = { age: number | null; gender: string | null; blood_group: string | null; abha_number: string | null;
  allergies: string[]; chronic_conditions: string[]; current_medications: string[]; latest_vitals: string[] };
type View = "patients" | "requests" | "trust";

const purposeLabel = (code: string | null) => ACCESS_PURPOSES.find((p) => p.code === code)?.label ?? "Access";

type Toast = { message: string; tone: "success" | "error" } | null;

// api() throws the raw response body; show FastAPI's "detail" message when there is one
function errorText(error: any, fallback: string) {
  try { return JSON.parse(error.message).detail || fallback; } catch { return error?.message || fallback; }
}

function fmtRemaining(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "Expired";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, "0")}s left` : `${secs}s left`;
}

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

export default function DoctorDashboard() {
  const { user, refreshUser, logout } = useAuth();
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
  const [hprInput, setHprInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [reportsVersion, setReportsVersion] = useState(0); // bump to reload the report list
  const [purpose, setPurpose] = useState("TREATMENT");
  const [recordTypes, setRecordTypes] = useState<string[]>([]);
  const [uploadType, setUploadType] = useState("");
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploadPatient, setUploadPatient] = useState<{ patient_id: number; patient_name: string } | null>(null);
  const [doctorReportName, setDoctorReportName] = useState("");
  const [doctorReportFile, setDoctorReportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<View>("patients");
  const [detailTab, setDetailTab] = useState<"timeline" | "snapshot">("timeline");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  const selectedSession = useMemo(
    () => activeSessions.find((row) => row.patient_id === selectedPatientId) ?? null,
    [activeSessions, selectedPatientId]
  );
  const sessionActive = Boolean(selectedSession && selectedSessionId && selectedSession.remaining_seconds > 0);

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

  async function loadOutgoing() {
    const [out, inc] = await Promise.all([api("/access/requests/outgoing").catch(() => []), api("/access/requests/incoming").catch(() => [])]);
    setOutgoing(Array.isArray(out) ? out : []);
    setIncomingCount(Array.isArray(inc) ? inc.length : 0);
  }

  function closeScan() {
    setScanning(false);
    setScanOpen(false);
  }

  useEffect(() => { api("/reports/types").then(setRecordTypes).catch(() => {}); }, []);

  // Cmd/Ctrl+K jumps to patient search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setView("patients"); setTimeout(() => searchRef.current?.focus()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSummary(null);
    if (selectedSessionId && selectedPatientId) api(`/reports/patient-summary/${selectedPatientId}`).then(setSummary).catch(() => {});
  }, [selectedSessionId, selectedPatientId]);

  useEffect(() => {
    // Doctor endpoints answer 403 until the HPR ID is verified, so don't poll them before that
    if (!isVerifiedDoctor) return;
    loadActiveSessions();
    loadHistoryPatients();
    loadOutgoing();
    const interval = window.setInterval(() => {
      loadActiveSessions();
      loadHistoryPatients();
      loadOutgoing();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isVerifiedDoctor]);

  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedSessionId(null);
      return;
    }
    loadSessionStatus(selectedPatientId);
    const interval = window.setInterval(() => loadSessionStatus(selectedPatientId), 5000);
    return () => window.clearInterval(interval);
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) return;
    if (!activeSessions.some((row) => row.patient_id === selectedPatientId)) {
      setSelectedSessionId(null);
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
          access_reason: purpose,
          reason_note: null,
        }),
      });
      setSelectedPatientId(patientId);
      setScanOpen(false);
      pushToast("Access request sent. Waiting for patient approval.");
      await Promise.all([loadActiveSessions(), loadOutgoing()]);
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
      }
      pushToast("Session ended successfully.");
      await loadActiveSessions();
      await loadHistoryPatients();
    } catch (error: any) {
      pushToast(error.message || "Failed to end session", "error");
    }
  }

  async function handleVerifyHpr() {
    try {
      setVerifying(true);
      await api("/user/me/registry-id", { method: "PUT", body: JSON.stringify({ registry_id: hprInput.trim() }) });
      await refreshUser();
      pushToast("HPR ID verified. You can now access patient records.");
    } catch (error: any) {
      pushToast(errorText(error, "Verification failed"), "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDoctorUpload() {
    if (!uploadPatient || !doctorReportFile) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("patient_id", String(uploadPatient.patient_id));
      fd.append("file", doctorReportFile);
      fd.append("record_date", uploadDate);
      if (uploadType) fd.append("record_type", uploadType);
      if (doctorReportName.trim()) fd.append("summary", doctorReportName.trim());
      await apiForm("/reports/upload-by-doctor", fd);
      pushToast("Report uploaded successfully.");
      setUploadPatient(null);
      setDoctorReportName("");
      setDoctorReportFile(null);
      await Promise.all([loadActiveSessions(), loadHistoryPatients()]);
      setReportsVersion((v) => v + 1);
    } catch (error: any) {
      pushToast(error.message || "Failed to upload report", "error");
    } finally {
      setUploading(false);
    }
  }

  const q = search.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const navItem = (key: View, label: string, icon: ReactNode, badge?: number) => (
    <button key={key} type="button" onClick={() => setView(key)} aria-current={view === key ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${view === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-700 hover:bg-white/60"}`}>
      {icon}<span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{badge}</span>}
    </button>
  );
  const groupLabel = (text: string) => <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{text}</div>;
  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const doctorName = user?.display_name || user?.email || "Doctor";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 font-sans text-slate-900 lg:grid lg:h-screen lg:grid-cols-[232px_300px_minmax(0,1fr)] lg:overflow-hidden">
      {toast && (
        <div className="fixed right-4 top-4 z-[60]" role="status">
          <div className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Sidebar: the glass navigation layer */}
      <aside className="glass flex flex-col gap-1 border-b border-white/60 p-3 lg:m-3 lg:mr-0 lg:rounded-3xl lg:border">
        <Link to="/" className="mb-2 flex items-center gap-2 px-3 py-2 text-lg font-extrabold tracking-tight">
          <span style={{ color: "#1d3a8a" }}>Own</span><span className="-ml-2" style={{ color: "#00b890" }}>Your</span><span className="-ml-2" style={{ color: "#1d3a8a" }}>Health</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Workspace">
          {navItem("patients", "Patients", <Users className="h-5 w-5" />)}
          {navItem("requests", "Requests", <Inbox className="h-5 w-5" />, incomingCount)}
          {navItem("trust", "Trust score", <BadgeCheck className="h-5 w-5" />)}
          <Link to="/doctor/logs" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-700 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
            <ScrollText className="h-5 w-5" />Access log
          </Link>
          <Link to="/profile" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-700 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
            <UserRound className="h-5 w-5" />Profile
          </Link>
        </nav>
        <Button className="mt-3 w-full" onClick={() => setScanOpen(true)} disabled={!isVerifiedDoctor}>
          <ScanLine className="mr-2 h-4 w-4" />Scan patient QR
        </Button>
        <div className="mt-auto hidden items-center gap-3 rounded-2xl bg-white/50 p-3 lg:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{initials(doctorName)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{doctorName}</div>
            <div className={`text-xs ${isVerifiedDoctor ? "text-emerald-700" : "text-amber-800"}`}>{isVerifiedDoctor ? "HPR verified" : "Not verified"}</div>
          </div>
          <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {!isVerifiedDoctor ? (
        <main className="p-4 lg:col-span-2 lg:overflow-y-auto lg:p-8">
          <div className="mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
            <ShieldCheck className="h-8 w-8 text-amber-600" />
            <h1 className="mt-3 text-2xl font-bold">Verify your HPR ID</h1>
            <p className="mt-1 text-[15px] text-slate-600">Only doctors verified with the Healthcare Professionals Registry can see patient records.</p>
            <div className="mt-4 flex gap-2">
              <Input value={hprInput} onChange={(event) => setHprInput(event.target.value)} placeholder="HPR registration ID" aria-label="HPR registration ID" />
              <Button onClick={handleVerifyHpr} isLoading={verifying} disabled={!hprInput.trim()}>Verify</Button>
            </div>
          </div>
        </main>
      ) : view === "requests" ? (
        <main className="space-y-4 p-4 lg:col-span-2 lg:overflow-y-auto lg:p-8">
          <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
          <p className="text-[15px] text-slate-600">Patients who found you in the directory and asked you to see their records.</p>
          <DoctorNotifications onActionComplete={() => { loadActiveSessions(); loadHistoryPatients(); loadOutgoing(); }} />
          {incomingCount === 0 && <div className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200/70">No requests right now.</div>}
        </main>
      ) : view === "trust" ? (
        <main className="max-w-2xl space-y-4 p-4 lg:col-span-2 lg:overflow-y-auto lg:p-8">
          <h1 className="text-3xl font-bold tracking-tight">Trust score</h1>
          <TrustPanel />
        </main>
      ) : (
        <>
          {/* Patient list */}
          <section className="flex flex-col p-3 lg:overflow-hidden" aria-label="Patients">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients" aria-label="Search patients"
                className="w-full rounded-xl border-0 bg-white/80 py-2.5 pl-9 pr-12 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-xs text-slate-500">⌘K</kbd>
            </div>
            <div className="mt-1 lg:flex-1 lg:overflow-y-auto">
              {groupLabel("Active now")}
              {activeSessions.filter((s) => match(s.patient_name)).map((s) => (
                <button key={s.patient_id} type="button" onClick={() => setSelectedPatientId(s.patient_id)} aria-current={s.patient_id === selectedPatientId ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${s.patient_id === selectedPatientId ? "bg-blue-600 text-white" : "hover:bg-white/70"}`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${s.patient_id === selectedPatientId ? "bg-white/20" : "bg-emerald-100 text-emerald-800"}`}>{initials(s.patient_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{s.patient_name}</span>
                    <span className={`block text-sm ${s.patient_id === selectedPatientId ? "text-blue-100" : "text-emerald-700"}`}>{fmtRemaining(s.remaining_seconds)}</span>
                  </span>
                </button>
              ))}
              {activeSessions.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Scan a patient's QR to start.</p>}

              {outgoing.length > 0 && groupLabel("Waiting for patient")}
              {outgoing.filter((r) => match(r.patient_name)).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Clock3 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{r.patient_name}</span>
                    <span className="block text-sm text-amber-800">{purposeLabel(r.access_reason)} · waiting</span>
                  </span>
                </div>
              ))}

              {historyPatients.length > 0 && groupLabel("Past")}
              {historyPatients.filter((p) => match(p.patient_name)).map((p) => (
                <div key={p.patient_id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/70">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">{initials(p.patient_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{p.patient_name}</span>
                    <span className="block text-sm text-slate-500">{fmtDate(p.last_accessed_at)}</span>
                  </span>
                  <button type="button" onClick={() => setUploadPatient({ patient_id: p.patient_id, patient_name: p.patient_name })} aria-label={`Upload a report for ${p.patient_name}`} title="Upload report"
                    className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                    <Upload className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Patient detail */}
          <main className="p-4 lg:overflow-y-auto lg:py-6 lg:pl-3 lg:pr-6">
            {!sessionActive || !selectedSession || !selectedSessionId ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm"><QrCode className="h-8 w-8 text-blue-600" /></div>
                <h2 className="mt-4 text-xl font-bold">No patient selected</h2>
                <p className="mt-1 max-w-sm text-[15px] text-slate-600">Scan a patient's QR. Once they approve, their records appear here.</p>
                <Button className="mt-4" onClick={() => setScanOpen(true)}><ScanLine className="mr-2 h-4 w-4" />Scan patient QR</Button>
              </div>
            ) : (
              <div className="space-y-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{selectedSession.patient_name}</h1>
                    <p className="mt-1 text-[15px] text-slate-600">
                      {[summary?.age && `${summary.age} yrs`, summary?.gender, summary?.blood_group && `Blood ${summary.blood_group}`].filter(Boolean).join(" · ")}
                      {summary?.abha_number && <span className="ml-2 text-emerald-700">ABHA {summary.abha_number} ✓</span>}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                      <Clock3 className="h-4 w-4" />Access ends in {fmtRemaining(selectedSession.remaining_seconds).replace(" left", "")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setUploadPatient({ patient_id: selectedSession.patient_id, patient_name: selectedSession.patient_name })}>
                      <Upload className="mr-2 h-4 w-4" />Upload
                    </Button>
                    <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleEndSession(selectedSession.patient_id)}>End session</Button>
                  </div>
                </header>

                {summary && (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {[
                      ["Allergies", summary.allergies, "text-red-700", "bg-red-50 ring-red-100"],
                      ["Conditions", summary.chronic_conditions, "text-slate-900", "bg-white ring-slate-200/70"],
                      ["Medications", summary.current_medications, "text-slate-900", "bg-white ring-slate-200/70"],
                      ["Latest values", summary.latest_vitals, "text-slate-900", "bg-white ring-slate-200/70"],
                    ].map(([label, values, text, box]) => (
                      <div key={label as string} className={`rounded-2xl p-4 shadow-sm ring-1 ${box}`}>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label as string}</div>
                        <div className={`mt-1 text-[15px] font-semibold ${text}`}>{(values as string[]).length ? (values as string[]).join(", ") : "None recorded"}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="inline-flex rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Patient view">
                  {(["timeline", "snapshot"] as const).map((t) => (
                    <button key={t} type="button" role="tab" aria-selected={detailTab === t} onClick={() => setDetailTab(t)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${detailTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                      {t}
                    </button>
                  ))}
                </div>

                {detailTab === "timeline"
                  ? <DoctorReportList key={`${selectedSessionId}-${reportsVersion}`} patientId={selectedSession.patient_id} sessionId={selectedSessionId} showSummary={false} />
                  : <PatientSummaryPanel patientId={selectedSession.patient_id} />}
              </div>
            )}
          </main>
        </>
      )}

      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="scan-title"
          onKeyDown={(e) => e.key === "Escape" && closeScan()}>
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <button type="button" className="rounded px-1 text-blue-600 hover:underline" onClick={closeScan}>Cancel</button>
              <h2 id="scan-title" className="font-bold">Scan patient QR</h2>
              <span className="w-12" />
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Purpose of access
              <select autoFocus value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={scanning} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px]">
                {ACCESS_PURPOSES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
              </select>
            </label>
            <p className="text-sm text-slate-600">The patient sees this purpose before they approve.</p>
            {scanning ? <div id="doctor-qr-reader" className="w-full overflow-hidden rounded-2xl" /> : (
              <Button className="w-full" onClick={() => setScanning(true)} disabled={validating || requesting}>
                <ScanLine className="mr-2 h-4 w-4" />{validating ? "Checking QR…" : requesting ? "Sending request…" : "Start camera"}
              </Button>
            )}
          </div>
        </div>
      )}

      {uploadPatient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="upload-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <button type="button" className="rounded px-1 text-blue-600 hover:underline" onClick={() => { setUploadPatient(null); setDoctorReportName(""); setDoctorReportFile(null); }}>Cancel</button>
              <h2 id="upload-title" className="font-bold">Upload report</h2>
              <button type="button" className="rounded px-1 font-bold text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline" onClick={handleDoctorUpload} disabled={uploading || !doctorReportFile}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">For {uploadPatient.patient_name}. Shows as doctor-verified in their records.</p>
            <div className="mt-4 space-y-3">
              <select value={uploadType} onChange={(event) => setUploadType(event.target.value)} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px]" aria-label="Record type">
                <option value="">Record type: detect automatically</option>
                {recordTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Input type="date" value={uploadDate} onChange={(event) => setUploadDate(event.target.value)} aria-label="Visit or report date" />
              <Input value={doctorReportName} onChange={(event) => setDoctorReportName(event.target.value)} placeholder="Short clinical summary (optional)" maxLength={280} />
              <input type="file" onChange={(event) => setDoctorReportFile(event.target.files?.[0] || null)} aria-label="Report file" className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
