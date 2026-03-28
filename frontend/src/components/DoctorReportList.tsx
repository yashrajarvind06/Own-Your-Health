import { useState, useEffect } from "react";
import { api } from "../api";
import { Button } from "./ui/Button";
import { Lock, FileText, CheckCircle, XCircle, Clock, Trash2, Timer, Ban } from "lucide-react";

type ReportStatus = "LOCKED" | "UNLOCKED" | "PENDING" | "DENIED" | "REVOKED" | "EXPIRED";

interface DoctorReportListProps {
    patientId: number;
    sessionId: number;
}

type ReportItem = {
    id: number;
    filename: string;
    created_at?: string;
    uploaded_by?: "PATIENT" | "DOCTOR";
};

export default function DoctorReportList({ patientId, sessionId }: DoctorReportListProps) {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [accessMap, setAccessMap] = useState<Record<number, ReportStatus>>({});

    // Store Expiry AND Type
    const [activeAccessData, setActiveAccessData] = useState<Record<number, { expires_at: string, access_type: string }>>({});

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal State
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isRequestOpen, setIsRequestOpen] = useState(false);
    const [accessReason, setAccessReason] = useState("FOLLOW_UP");

    useEffect(() => {
        loadData();
    }, [sessionId, patientId]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch all reports for patient
            let list = [];
            try {
                const listRes = await api(`/reports/list?patient_id=${patientId}`);
                if (Array.isArray(listRes)) {
                    list = listRes;
                }
            } catch (err) {
                console.warn("Failed to fetch report list:", err);
            }

            // 2. Fetch Active Access (Unlocked) for session
            const curActiveData: Record<number, { expires_at: string, access_type: string }> = {};
            try {
                const accessibleRes = await api(`/access/reports/active?session_id=${sessionId}`);
                if (Array.isArray(accessibleRes)) {
                    accessibleRes.forEach((a: any) => {
                        curActiveData[Number(a.report_id)] = {
                            expires_at: a.expires_at,
                            access_type: a.access_type || "STANDARD" // Fallback if old API
                        };
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch unlocked reports:", err);
            }

            // 3. Fetch Revoked Access
            let revokedIds = new Set<number>();
            try {
                const revokedRes = await api(`/access/reports/revoked?session_id=${sessionId}`);
                if (Array.isArray(revokedRes)) {
                    revokedRes.forEach((r: any) => revokedIds.add(Number(r.report_id)));
                }
            } catch (err) {
                console.warn("Failed to fetch revoked reports:", err);
            }

            // 4. Fetch Requests (Pending/Denied) for session
            let requests = [];
            try {
                const requestsRes = await api(`/access/reports/requests?session_id=${sessionId}`);
                if (Array.isArray(requestsRes)) {
                    requests = requestsRes;
                }
            } catch (err) {
                console.warn("Failed to fetch requests:", err);
            }

            // Build Status Map
            const statusMap: Record<number, ReportStatus> = {};

            list.forEach((r: any) => {
                const rId = r.id;

                // Priority Logic
                if (revokedIds.has(rId)) {
                    statusMap[rId] = "REVOKED";
                } else if (curActiveData[rId]) {
                    statusMap[rId] = "UNLOCKED";
                } else {
                    const req = requests.find((req: any) => req.report_id === rId);
                    if (req) {
                        const s = req.status;
                        if (s === 'APPROVED') {
                            // Approved but not in curActiveData -> EXPIRED
                            statusMap[rId] = "EXPIRED";
                        } else {
                            statusMap[rId] = s as ReportStatus;
                        }
                    } else {
                        statusMap[rId] = "LOCKED";
                    }
                }
            });

            setReports(list);
            setAccessMap(statusMap);
            setActiveAccessData(curActiveData);

        } catch (e: any) {
            console.error("Failed to load doctor report list", e);
            setError(e.message || "Failed to load reports");
        } finally {
            setLoading(false);
        }
    };

    const handleRequestAccess = async () => {
        if (!selectedReport) return;
        try {
            await api("/access/reports/request", {
                method: "POST",
                body: JSON.stringify({
                    session_id: sessionId,
                    report_id: selectedReport.id,
                    reason: accessReason
                })
            });
            setIsRequestOpen(false);
            loadData();
        } catch (e: any) {
            alert(e.message || "Request failed");
        }
    };

    const openReport = async (reportId: number) => {
        try {
            const res = await api("/reports/access", {
                method: "POST",
                body: JSON.stringify({ report_ids: [reportId] })
            });
            if (res && res[0]?.url) {
                window.open(res[0].url, "_blank");
            }
        } catch (e: any) {
            alert("Failed to open report");
        }
    };

    const getTimeRemaining = (expiry: string) => {
        if (!expiry) return null;
        const diff = new Date(expiry).getTime() - new Date().getTime();
        const mins = Math.ceil(diff / 60000);
        return mins > 0 ? `${mins}m` : "Expiring...";
    };

    if (loading) return <div className="p-4 text-center text-gray-500">Loading reports...</div>;
    if (error) return <div className="p-4 text-center text-red-500 text-sm">Error: {error}</div>;
    if (reports.length === 0) return <div className="p-8 text-center text-gray-400">No medical reports found.</div>;

    return (
        <div className="space-y-3">
            {reports.map(r => {
                const status = accessMap[r.id] || "LOCKED";

                // Determine Visual Filters
                // Only show Yellow if status UNLOCKED AND Type is TEMPORARY
                const accessInfo = activeAccessData[r.id];
                const isTemp = accessInfo?.access_type === "TEMPORARY";

                const isTempUnlocked = status === 'UNLOCKED' && isTemp;
                const isStandardUnlocked = status === 'UNLOCKED' && !isTemp;

                const expiry = (isTempUnlocked || isStandardUnlocked) ? accessInfo?.expires_at : null;
                const timeRemaining = getTimeRemaining(expiry || "");

                // Logic for Container Classes
                let containerClasses = "bg-white border-gray-200";
                if (isTempUnlocked) containerClasses = "bg-yellow-50 border-yellow-200 shadow-sm";
                else if (isStandardUnlocked) containerClasses = "bg-green-50 border-green-200 shadow-sm";
                else if (status === 'REVOKED') containerClasses = "bg-red-50 border-red-200";
                else if (status === 'EXPIRED') containerClasses = "bg-gray-50 border-gray-200 opacity-75"; // Grey for Expired

                // Logic for Icon Container
                let iconContainerClasses = "bg-gray-100 text-gray-400";
                if (isTempUnlocked) iconContainerClasses = "bg-yellow-100 text-yellow-600";
                else if (isStandardUnlocked) iconContainerClasses = "bg-green-100 text-green-600";
                else if (status === 'REVOKED') iconContainerClasses = "bg-red-100 text-red-500";
                else if (status === 'EXPIRED') iconContainerClasses = "bg-gray-200 text-gray-500";

                return (
                    <div key={r.id} className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${containerClasses}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconContainerClasses}`}>
                                {isTempUnlocked || isStandardUnlocked ? <FileText size={20} /> :
                                    status === 'REVOKED' ? <XCircle size={20} /> :
                                        status === 'EXPIRED' ? <Clock size={20} /> :
                                            <Lock size={20} />}
                            </div>
                            <div>
                                <div className="font-medium text-gray-900 flex items-center gap-2">
                                    {r.filename}
                                    {isTempUnlocked && (
                                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                            Temp Access
                                        </span>
                                    )}
                                    {isStandardUnlocked && (
                                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                            Unlocked
                                        </span>
                                    )}
                                    {status === 'EXPIRED' && (
                                        <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                            Expired
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {r.created_at ? r.created_at.split('T')[0] : 'Date Unknown'}
                                </div>
                                <div className={`mt-1 text-xs ${r.uploaded_by === "DOCTOR" ? "text-green-600" : "text-yellow-600"}`}>
                                    {r.uploaded_by === "DOCTOR" ? "🟢 Verified Doctor" : "🟡 Patient Uploaded"}
                                </div>
                            </div>
                        </div>

                        <div>
                            {status === 'UNLOCKED' && (
                                <div className="flex items-center gap-2">
                                    {isTempUnlocked && (
                                        <div className="text-xs font-mono font-medium text-yellow-700 bg-yellow-100/50 px-2 py-1.5 rounded flex items-center gap-1">
                                            <Timer size={12} />
                                            {timeRemaining}
                                        </div>
                                    )}
                                    <Button size="sm" className={
                                        isTempUnlocked ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-600 text-white shadow-sm" :
                                            "bg-green-600 hover:bg-green-700 border-green-600 text-white shadow-sm"
                                    } onClick={() => openReport(r.id)}>
                                        View
                                    </Button>
                                </div>
                            )}
                            {status === 'LOCKED' && (
                                <Button size="sm" onClick={() => {
                                    setSelectedReport(r);
                                    setIsRequestOpen(true);
                                }}>Request Access</Button>
                            )}
                            {status === 'PENDING' && (
                                <Button size="sm" variant="secondary" disabled className="opacity-75 cursor-not-allowed">
                                    <Clock size={14} className="mr-1 inline" /> Pending
                                </Button>
                            )}
                            {status === 'DENIED' && (
                                <Button size="sm" variant="danger" disabled className="opacity-75 cursor-not-allowed">
                                    <XCircle size={14} className="mr-1 inline" /> Denied
                                </Button>
                            )}
                            {status === 'REVOKED' && (
                                <Button size="sm" variant="outline" disabled className="opacity-60 cursor-not-allowed border-red-200 text-red-500">
                                    <XCircle size={14} className="mr-1 inline" /> Revoked
                                </Button>
                            )}
                            {status === 'EXPIRED' && (
                                <Button size="sm" variant="outline" disabled className="opacity-60 cursor-not-allowed border-gray-200 text-gray-400">
                                    <Ban size={14} className="mr-1 inline" /> Expired
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Request Modal */}
            {isRequestOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Request Access</h3>

                        <div className="bg-yellow-50 p-3 rounded-lg space-y-2 text-sm border border-yellow-100">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Report:</span>
                                <span className="font-medium">{selectedReport?.filename}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Type:</span>
                                <span className="font-bold text-yellow-700">Temporary Request</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Duration:</span>
                                <span className="font-bold text-yellow-700">10 Minutes (Fixed)</span>
                            </div>
                            <p className="text-xs text-yellow-600 pt-1">
                                <Clock size={12} className="inline mr-1" />
                                Access expires automatically. 1-request limit per session.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Reason</label>
                            <select
                                className="w-full border-gray-300 rounded-lg text-sm p-2 bg-gray-50"
                                value={accessReason}
                                onChange={e => setAccessReason(e.target.value)}
                            >
                                <option value="FOLLOW_UP">Follow-up consultation</option>
                                <option value="DIAGNOSTIC">Diagnostic review</option>
                                <option value="MEDICATION">Medication review</option>
                                <option value="PROCEDURE">Procedure pre-check</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" className="flex-1" onClick={() => setIsRequestOpen(false)}>Cancel</Button>
                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleRequestAccess}>Send Request</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
