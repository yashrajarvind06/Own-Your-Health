import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { api } from "../api";
import QRBadge from "../components/QRBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import DoctorReportList from "../components/DoctorReportList";

type EmergencyProfile = {
  blood_group?: string;
  allergies?: string;
  chronic_diseases?: string;
  medications?: string;
  emergency_contact?: string;
  past_surgeries?: string;
};

// --- Helpers ---
/** Backend /session/status returns an array; normalise to a single object. */
function normalizeSession(res: any) {
  return Array.isArray(res) ? res[0] : res;
}

// --- Definitions ---
const ACCESS_REASONS = [
  { code: 'FOLLOW_UP', label: 'Follow-up consultation' },
  { code: 'DIAGNOSTIC', label: 'Diagnostic review' },
  { code: 'MEDICATION', label: 'Medication review' },
  { code: 'PROCEDURE', label: 'Procedure preparation' },
  { code: 'EMERGENCY_EVAL', label: 'Emergency evaluation' },
  { code: 'OTHER', label: 'Other (requires note)' }
];

interface ScanQRProps {
  initialPatientId?: number | null;
}

export default function ScanQR({ initialPatientId }: ScanQRProps) {
  console.log("DEBUG: ScanQR Component Loaded (Phase 3 - Modular)");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"none" | "pending" | "granted" | "expired" | "denied" | "emergency">("none");
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  // Sync with prop
  useEffect(() => {
    if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);
  const [emergencyProfile, setEmergencyProfile] = useState<EmergencyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 2: Reason Modal State (For Session Access, NOT Reports)
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  const initiateRequest = () => {
    setError(null);
    if (!token) return setError("Please scan a QR code or enter a token.");
    if (!patientId) return setError("Please enter a Patient ID.");
    // Show Modal
    setShowReasonModal(true);
    setSelectedReason("");
    setReasonNote("");
  };

  const confirmAccessRequest = async () => {
    setError(null);
    if (!selectedReason) return setError("Please select a reason for access.");
    if (selectedReason === 'OTHER' && !reasonNote.trim()) return setError("Please provide a note for 'Other'.");

    try {
      // Normal Access Request with Reason (Body Payload)
      await api(`/access/request-v2`, {
        method: "POST",
        body: JSON.stringify({
          token: token,
          patient_id: patientId,
          access_context: "NORMAL",
          access_reason: selectedReason,
          reason_note: reasonNote
        })
      });
      setShowReasonModal(false);
      setStatus("pending");

      // Initial status check right after submitting (backend response is an array)
      const _raw = await api(`/access/session/status?patient_id=${patientId}`);
      const qrInfo = normalizeSession(_raw);
      if (!qrInfo) return; // empty array guard

      if (qrInfo.status?.toLowerCase() === "granted") {
        setStatus("granted");
        setRemaining(qrInfo.remaining_seconds ?? 0);
        if (qrInfo.id) setSessionId(qrInfo.id);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const emergencyAccess = async () => {
    setError(null);
    if (!patientId) return setError("Patient ID required for Emergency Override.");

    // Strict Confirmation Standard
    const confirmed = window.confirm(
      "CONFIRM EMERGENCY OVERRIDE\n\n" +
      "Use only in life-threatening situations.\n" +
      "This action will be logged as a CRITICAL security event.\n\n" +
      "Are you sure you want to break glass?"
    );
    if (!confirmed) return;

    try {
      // Emergency Override (Explicit)
      await api(`/emergency/override`, {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId }),
        headers: { "Content-Type": "application/json" }
      });
      // Fetch profile (View intent)
      const res = await api(`/emergency/profile?patient_id=${patientId}`, {
        headers: { "X-Access-Intent": "EMERGENCY_VIEW" }
      });
      setEmergencyProfile(res);
      setStatus("emergency");
    } catch (e: any) { setError(e.message); }
  };

  const [isScanning, setIsScanning] = useState(false);

  const validateQR = async (scannedToken: string) => {
    try {
      setError(null);
      const res = await api("/qr/validate", {
        method: "POST",
        body: JSON.stringify({ token: scannedToken })
      });

      if (res.valid && res.patient_id) {
        setToken(scannedToken);
        setPatientId(res.patient_id);
        setError(null);
        setIsScanning(false);
      }
    } catch (e: any) {
      setError("Invalid or Expired QR Code.");
    }
  };

  const manualRefresh = async () => {
    setStatus("none");
    // Trigger update immediately
    setTimeout(() => {
      // Poll logic handles
    }, 100);
  };

  useEffect(() => {
    // Poll Status Logic
    if (!patientId || status === "emergency") return;

    const pollStatus = async () => {
      try {
        const res = await api(`/access/session/status?patient_id=${patientId}`);
        const qrInfo = normalizeSession(res);

        if (!qrInfo || !qrInfo.status) {
          return;
        }

        const s = qrInfo.status.toUpperCase();

        if (s === "GRANTED") {
          if (status !== "granted") {
            setStatus("granted");
          }
          setRemaining(qrInfo.remaining_seconds);
          if (qrInfo.id) setSessionId(qrInfo.id);

        } else if (s === "DENIED") {
          setStatus("denied");
        } else if (s === "WAITING_APPROVAL") {
          setStatus("pending");
        } else if (s === "EXPIRED") {
          setStatus("expired");
        } else {
          const mapping: any = { "IDLE": "none", "REVOKED": "expired", "QR_VERIFIED": "none" };
          setStatus(mapping[s] || "none");
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [patientId, status]);

  useEffect(() => {
    if (!isScanning) return;

    const scannerId = "qr-reader";
    const element = document.getElementById(scannerId);
    if (!element) return;

    element.innerHTML = "";

    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 25,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        videoConstraints: { facingMode: "environment" }
      },
      false
    );

    scanner.render(
      (decodedText) => {
        scanner.clear();
        setIsScanning(false);
        validateQR(decodedText);
      },
      (error) => { }
    );

    return () => {
      scanner.clear().catch((err) => console.error("Failed to clear scanner", err));
    };
  }, [isScanning]);

  return (
    <div className="grid md:grid-cols-2 gap-6 relative">
      {/* Reason Modal (Session) */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900 border-b pb-2">Reason for Access</h3>
            <p className="text-sm text-gray-500">Please specify why you are accessing this patient's records.</p>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Select Reason <span className="text-red-500">*</span></label>
              <select
                className="w-full border-gray-300 rounded-lg p-2 text-sm"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
              >
                <option value="">-- Select --</option>
                {ACCESS_REASONS.map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>
            {selectedReason === 'OTHER' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Explanation Note <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border-gray-300 rounded-lg p-2 text-sm h-24"
                  placeholder="Details..."
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowReasonModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={confirmAccessRequest} disabled={!selectedReason || (selectedReason === 'OTHER' && !reasonNote.trim())}>
                Confirm Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Card */}
      <Card title="Scanner & Controls">
        <div className="text-xs text-green-600 font-bold text-center mb-2">
          System v2.1 (Break-Glass Active)
        </div>
        <div className="mb-4 bg-gray-50 p-4 rounded-lg flex flex-col items-center justify-center min-h-[300px]">
          {!isScanning ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-3xl mb-4 text-blue-600">📷</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Scan Patient QR Code</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">Camera is off to protect patient privacy.</p>
              <Button onClick={() => setIsScanning(true)} size="lg">Start Camera Scan</Button>
            </div>
          ) : (
            <div className="w-full">
              <div id="qr-reader" className="w-full" />
              <Button variant="outline" size="sm" onClick={() => setIsScanning(false)} className="mt-4 w-full bg-white">Cancel Scan</Button>
            </div>
          )}
        </div>
        {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4">{error}</div>}
        <div className="space-y-3">
          <Input label="Token (from QR)" placeholder="Scan or enter token" value={token} onChange={e => setToken(e.target.value)} />
          <Input label="Patient ID" type="number" placeholder="Enter Patient ID" value={patientId || ""} onChange={e => setPatientId(Number(e.target.value))} />
          <div className="flex gap-2 pt-2">
            <Button onClick={initiateRequest} className="flex-1" disabled={!token || !patientId || status === 'pending' || status === 'granted'}>
              {status === 'pending' ? 'Request Pending...' : status === 'granted' ? 'Access Granted' : 'Select Access Reason'}
            </Button>
            <Button onClick={emergencyAccess} variant="danger" className="flex-1" disabled={!patientId || status === 'granted'} title={status === 'granted' ? "Access already granted." : "Use only in life-threatening"}>
              Emergency Override
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Current Status:</span>
            <QRBadge status={status} remainingSeconds={remaining} />
          </div>
        </div>
      </Card>

      {/* Profile & Reports */}
      <div className="space-y-6">
        <Card title="Emergency Profile" className={`transition-all ${status === 'emergency' ? 'ring-2 ring-red-500 shadow-lg' : ''}`}>
          {!emergencyProfile ? (
            <div className="text-gray-500 text-center py-6 text-sm flex flex-col items-center gap-3">
              {status === 'emergency' ? 'Loading...' : 'Emergency data hidden'}
              {patientId && (
                <Button size="sm" variant="secondary" onClick={async () => {
                  try {
                    const res = await api(`/emergency/profile?patient_id=${patientId}`, {
                      headers: { "X-Access-Intent": "EMERGENCY_VIEW" }
                    });
                    setEmergencyProfile(res);
                  } catch (e: any) { setError(e.message); }
                }} title="View emergency info">
                  View Emergency Information
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-semibold text-gray-700">Blood Group:</div><div>{emergencyProfile.blood_group || "-"}</div>
                <div className="font-semibold text-gray-700">Emerg. Contact:</div><div>{emergencyProfile.emergency_contact || "-"}</div>
              </div>
              <div className="font-semibold text-gray-700 text-sm">Allergies:</div>
              <div className="p-2 bg-red-50 text-red-800 rounded text-sm mt-1">{emergencyProfile.allergies || "None"}</div>
            </div>
          )}
        </Card>

        <Card title="Shared Medical Reports">
          {status === "emergency" ? (
            <div className="text-red-600 bg-red-50 p-4 rounded-lg text-center border border-red-200">
              <div className="font-bold mb-1">⚠️ STRICT PRIVACY RESTRICTION</div>
              <div className="text-sm">Emergency Override grants access to LIFE-SAVING profile data only.<br />Full medical history remains locked.</div>
            </div>
          ) : status !== "granted" ? (
            <div className="text-gray-500 text-center py-6 text-sm flex flex-col items-center gap-2">
              Access not granted yet (Status: {status}).
              <Button size="sm" variant="outline" onClick={manualRefresh}>Force Refresh</Button>
            </div>
          ) : (
            // Integration Point for DoctorReportList
            patientId && sessionId ? (
              <DoctorReportList patientId={patientId} sessionId={sessionId} />
            ) : (
              <div className="text-center text-gray-400 py-4">Waiting for Session ID...</div>
            )
          )}
        </Card>
      </div>
    </div>
  );
}
