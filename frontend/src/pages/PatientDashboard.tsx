import { useEffect, useState } from "react";
import { api } from "../api";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Link } from "react-router-dom";
import { ActiveAccessPanel } from "../components/ActiveAccessPanel";
import { ReportSelectionModal } from "../components/ReportSelectionModal";

import { useAuth } from "../context/AuthContext";
import { listAccessedBy } from "../api";

interface IncomingAccessLink {
  id: number;
  owner_email?: string | null;
  owner_name?: string | null;
  relationship: string;
}

export default function PatientDashboard() {
  const { user } = useAuth();

  // State
  const [viewingReport, setViewingReport] = useState<any>(null); // For future
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [durations, setDurations] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [managedBy, setManagedBy] = useState<IncomingAccessLink[]>([]);

  // Initial Data Load
  useEffect(() => {
    if (!user) return;
    pollPending();
    checkActiveQR();
    loadManagedBy();
    const id = setInterval(pollPending, 3000);
    return () => clearInterval(id);
  }, [user]);

  // Strict 1-second decrement timer
  /* ... unchanged ... */

  /* ... */


  useEffect(() => {
    if (secondsLeft === null) return;

    if (secondsLeft <= 0) {
      handleExpiry();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  // If it hits 0, trigger cleanup
  useEffect(() => {
    if (secondsLeft === 0) handleExpiry();
  }, [secondsLeft]);

  const handleExpiry = () => {
    setQrToken(null);
    setSecondsLeft(null);
    sessionStorage.removeItem("active_qr");
  };

  const pollPending = async () => {
    if (!user) return;
    try {
      console.log(`DEBUG: Dashboard Polling Pending for User ${user.id}...`);
      const items = await api(`/access/requests/pending?patient_id=${user.id}`);
      console.log("DEBUG: Pending Items:", items);
      if (Array.isArray(items)) {
        setPending(items);
        if (items.length === 0) console.log("DEBUG: No pending requests found.");
      } else {
        console.error("DEBUG: Pending API returned non-array:", items);
      }
    } catch (err) { console.error("Polling Error:", err); }
  };

  const checkActiveQR = async () => {
    try {
      // First check if backend says we have an active QR
      // We know /qr/active requires a token param based on reading qr.py, 
      // BUT logic in qr.py says: get_active_qr(token: str...)
      // This implies client must know the token to check it.
      // If we don't store it, we can't check it.
      // Prompt says: "Never store QR token long-term"
      // Prompt also says: "Refresh page still respects expiry"
      // This implies we DO need to persist it somehow or fetch it.
      // However, the backend doesn't seem to have a "get current active token for user" endpoint.
      // It only has 'generate' and 'validate'.
      // If I can't store it, and backend doesn't give it to me, I can't restore it on refresh.
      // I will assume for now I can store it in sessionStorage (which is not "long-term" like DB/localStorage) 
      // OR the prompt implies "don't store it in a DB on client side forever".
      // Let's use sessionStorage to survive refresh but not session close.
      const stored = sessionStorage.getItem("active_qr");
      if (stored) {
        // Verify and get expiry
        const details = await api(`/qr/expiry?token=${stored}`);
        // If valid
        if (details.expiry_seconds_remaining > 0) {
          setQrToken(stored);
          setSecondsLeft(details.expiry_seconds_remaining);
        } else {
          sessionStorage.removeItem("active_qr");
        }
      }
    } catch (e) {
      console.error("Failed to restore QR", e);
      sessionStorage.removeItem("active_qr");
    }
  };

  const genQR = async () => {
    try {
      setError(null);
      const res = await api("/qr/generate", { method: "POST" });
      const token = res.token;

      const details = await api(`/qr/expiry?token=${token}`);

      setQrToken(token);
      setSecondsLeft(details.expiry_seconds_remaining);
      sessionStorage.setItem("active_qr", token);

    } catch (err: any) {
      console.error("GenQR Error:", err);
      setError("Failed to generate QR: " + err.message);
    }
  };

  const [approvingReqId, setApprovingReqId] = useState<number | null>(null);

  // 1. User Clicks "Allow Access" -> Open Modal
  const initiateApproval = (id: number) => {
    setApprovingReqId(id);
  };

  // 2. User Confirms Selection -> execute APIs
  const finalizeApproval = async (selectedReportIds: number[]) => {
    if (!approvingReqId) return;
    const id = approvingReqId;

    try {
      setError(null);
      const duration = durations[id] || "15m";

      // Step A: Approve Session
      const res = await api("/access/approve", {
        method: "POST",
        body: JSON.stringify({ request_id: id, duration })
      });
      const sessionId = res.session_id;

      // Step B: Grant Reports (if any selected)
      if (selectedReportIds.length > 0 && sessionId) {
        await api("/access/reports/grant", {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            report_ids: selectedReportIds,
            duration: duration // Match session duration for reports
          })
        });
      }

      setApprovingReqId(null); // Close Modal
      await pollPending(); // Refresh
    } catch (err: any) {
      console.error("Approve Error:", err);
      setError("Failed to approve: " + (err.message || "Unknown error"));
    }
  };

  const cancelApproval = () => {
    setApprovingReqId(null);
  };

  const deny = async (id: number) => {
    try {
      setError(null);
      await api(`/access/deny?request_id=${id}`, { method: "POST" });
      await pollPending();
    } catch (err: any) {
      console.error("Deny Error:", err);
      setError("Failed to deny: " + (err.message || "Unknown error"));
    }
  };

  const loadManagedBy = async () => {
    try {
      const incoming = await listAccessedBy();
      setManagedBy(Array.isArray(incoming) ? incoming : []);
    } catch (err) {
      console.error("Managed-by load failed", err);
      setManagedBy([]);
    }
  };

  // Helper to format mm:ss
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          Error loading dashboard: {error}
        </div>
      )}

      {managedBy.length > 0 && (
        <section className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">
            Managed By
          </p>
          <div className="space-y-2">
            {managedBy.map((link) => (
              <div key={link.id} className="rounded-lg bg-white border border-emerald-100 px-4 py-3">
                <p className="font-semibold text-emerald-900">
                  {link.owner_name || link.owner_email} can access this profile
                </p>
                <p className="text-sm text-emerald-700">{link.owner_email}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 1. My Health QR (HERO) */}
      <section id="qr-section" className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-4 text-center sm:text-left">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">My OwnYourHealth QR</h2>
              <p className="text-blue-100 mt-1 max-w-md">
                Scan this code to instantly share your health profile with doctors. You control who gets access.
              </p>
            </div>
            <div className="flex gap-3 justify-center sm:justify-start">
              <button
                onClick={genQR}
                disabled={!!qrToken}
                className={`inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-semibold shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300 ${!!qrToken
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-blue-600 hover:bg-blue-50 hover:shadow-lg"
                  }`}
              >
                {qrToken ? "QR Active" : "Generate New QR"}
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-xl transform rotate-1 transition-transform hover:rotate-0 min-h-[220px] min-w-[220px] flex items-center justify-center">
            {qrToken && secondsLeft !== null && secondsLeft > 0 ? (
              <div className="flex flex-col items-center animate-in fade-in duration-300">
                <QRCodeCanvas value={qrToken} size={160} />
                <div className="mt-4 flex flex-col items-center gap-1">
                  {/* Countdown */}
                  <span className={`text-xl font-mono font-bold ${secondsLeft < 60 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                    {formatTime(secondsLeft)}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">Valid for 10 minutes</span>
                </div>
              </div>
            ) : (
              <div onClick={genQR} className="w-[160px] h-[160px] flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-blue-200 text-blue-500 cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors group">
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {secondsLeft === 0 ? "⚠️" : "🔍"}
                </span>
                <span className="text-xs font-semibold mt-2 text-center px-2">
                  {secondsLeft === 0 ? "QR Expired. Generate New" : "Click to Generate"}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN: CRITICAL INFO */}
        <div className="lg:col-span-2 space-y-8">

          {/* 2. Pending Access Requests */}
          {pending.length > 0 && (
            <Card title="Pending Access Requests" className="border-yellow-200 bg-yellow-50/50">
              <div className="space-y-3">
                {pending.map(p => (
                  <div key={p.id} className="bg-white border border-yellow-100 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-gray-900">{p.doctor_name || `Dr. ${p.doctor_id}`} is requesting access</p>
                      <div className="mt-1 flex items-center gap-2">
                        <label className="text-sm text-gray-600">Duration:</label>
                        <select
                          className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          value={durations[p.id] || "15m"}
                          onChange={(e) => setDurations({ ...durations, [p.id]: e.target.value })}
                        >
                          <option value="15m">15 Minutes</option>
                          <option value="1h">1 Hour</option>
                          <option value="1d">1 Day</option>
                          <option value="7d">7 Days</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                      <Button size="sm" onClick={() => initiateApproval(p.id)} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700">Allow Access</Button>
                      <Button size="sm" variant="outline" onClick={() => deny(p.id)} className="flex-1 sm:flex-none text-red-600 border-red-200 hover:bg-red-50">Deny</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 3. Quick Access */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/patient/emergency-profile" className="block group">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100 hover:shadow-md hover:border-red-200 transition-all">
                <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center text-red-600 text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🚑
                </div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-red-700">Emergency Profile</h3>
                <p className="text-sm text-gray-500 mt-1">Manage critical medical data shared in emergencies.</p>
              </div>
            </Link>

            <Link to="/patient/records" className="block group">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100 hover:shadow-md hover:border-blue-200 transition-all">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 text-2xl mb-4 group-hover:scale-110 transition-transform">
                  📂
                </div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700">My Records</h3>
                <p className="text-sm text-gray-500 mt-1">View and upload your medical reports securely.</p>
              </div>
            </Link>
          </div>
        </div>

        <Link to="/family">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer">
            <h2 className="text-lg font-semibold text-gray-800">👨‍👩‍👧 Family Mode</h2>
            <p className="text-sm text-gray-500 mt-1">
              Add family members to manage your health records on your behalf
            </p>
          </div>
        </Link>

        {/* RIGHT COLUMN: SECURITY & TRUST */}
        <div className="space-y-8">

          {/* 4. Active Access Control Panel */}
          <ActiveAccessPanel />

          <div className="text-right mt-2">
            <Link to="/patient/history" className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-end gap-1">
              <span>📜</span> View Full Access & Audit History →
            </Link>
          </div>

          {/* 5. Security & Trust */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg shadow-slate-200/20 border border-slate-700/50 overflow-hidden text-slate-300">
            <div className="px-6 py-5 border-b border-slate-700/50">
              <h3 className="text-lg font-bold text-white tracking-tight">🔒 Your Data, Your Control</h3>
            </div>
            <div className="p-6 space-y-5">

              {/* Item 1 */}
              <div className="flex gap-4 group">
                <div className="mt-0.5 text-blue-400 group-hover:scale-110 transition-transform duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><rect x="11" y="9" width="2" height="2" /><rect x="11" y="13" width="2" height="6" /></svg>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">Encrypted & Private</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">AES-256 encryption. No access without your approval.</p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex gap-4 group">
                <div className="mt-0.5 text-amber-400 group-hover:animate-pulse transition-all duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">Time-Limited Access</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">Doctor sessions auto-expire in 10 minutes.</p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex gap-4 group">
                <div className="mt-0.5 text-purple-400 group-hover:rotate-12 transition-transform duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">Tamper-Proof History</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">All uploads are hashed. Any change leaves a trace.</p>
                </div>
              </div>

            </div>
            <div className="pb-6 px-6">
              <div className="pt-5 border-t border-slate-700/50">
                <p className="text-center text-[10px] uppercase tracking-widest font-semibold text-slate-500 opacity-70">Patient Control Protocol v1.0</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
            <p className="text-blue-800 font-semibold text-sm">Need Help?</p>
            <p className="text-blue-600 text-xs mt-1">Contact support at secure@ownyourhealth.com</p>
          </div>
        </div>

      </div>

      {/* Report Selection Modal */}
      {approvingReqId && (
        <ReportSelectionModal
          patientId={user?.id || 0}
          onConfirm={finalizeApproval}
          onCancel={cancelApproval}
        />
      )}
    </div>
  );
}
