import { useEffect, useState } from "react";
import { api, apiForm } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Lock, Unlock, Eye, Clock, FileText, Download, ShieldCheck, Plus, Search, X, AlertCircle, User as UserIcon, RefreshCw, Trash2 } from "lucide-react";
import PendingRequestsList from "../components/PendingRequestsList";

type Report = {
    id: number;
    filename: string;
    created_at: string;
    presigned_url: string;
    blockchain_tx?: string;
    report_id: string; // The user-entered ID/Name
    summary?: string;
    uploaded_by: "PATIENT" | "DOCTOR";
};

type ReportState = "LOCKED" | "SHARED" | "EXPIRED" | "VIEWED";

type ShareInfo = {
    sessionId: number;
    doctorName: string;
    expiresIn: string;
    expiryDate: Date;
    doctorId: number;
    accessType: "STANDARD" | "TEMPORARY";
    isExpired: boolean;
};

type PermissionMeta = {
    status: ReportState;
    shares: ShareInfo[]; // Support multiple doctors
    viewCount?: number;
};

// --- Components ---

const ManageAccessModal = ({
    isOpen,
    onClose,
    reportName,
    shares,
    onRevoke
}: {
    isOpen: boolean;
    onClose: () => void;
    reportName: string;
    shares: ShareInfo[];
    onRevoke: (sessionId: number, doctorId: number) => void;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 slide-in-from-bottom-2">
                <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Manage Access</h3>
                        <p className="text-sm text-gray-500">For report: <span className="font-medium text-gray-700">{reportName}</span></p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {shares.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <p>No active access sessions.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {shares.map(share => {
                                const isTemp = share.accessType === "TEMPORARY";
                                return (
                                    <div key={share.sessionId} className={`flex items-center justify-between p-3 rounded-lg border 
                                        ${isTemp ? 'bg-yellow-50 border-yellow-100' : 'bg-emerald-50 border-emerald-100'} transition-all duration-300`}>
                                        <div>
                                            <div className="font-medium text-gray-900 flex items-center gap-2">
                                                {share.doctorName}
                                                {isTemp && <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded uppercase font-bold">Temp</span>}
                                            </div>
                                            <div className={`flex items-center gap-1.5 text-xs mt-0.5 ${isTemp ? 'text-yellow-700' : 'text-emerald-700'}`}>
                                                <Clock size={10} />
                                                <span className="font-medium">{share.expiresIn}</span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 bg-white"
                                            onClick={() => onRevoke(share.sessionId, share.doctorId)}
                                        >
                                            Revoke
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="bg-blue-50 p-3 rounded-lg flex items-start gap-2 text-xs text-blue-700">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <p>Revoking access will immediately remove access to this report for this doctor.</p>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 flex justify-end">
                    <Button variant="outline" onClick={onClose}>Done</Button>
                </div>
            </div>
        </div>
    );
};

const ReportCard = ({
    report,
    perm,
    onManage,
    onDelete
}: {
    report: Report;
    perm: PermissionMeta;
    onManage: () => void;
    onDelete: () => void;
}) => {
    // If we have active shares, status is SHARED.
    const isShared = perm.shares && perm.shares.length > 0;

    const standardShares = perm.shares.filter(s => s.accessType === "STANDARD");
    const tempShares = perm.shares.filter(s => s.accessType === "TEMPORARY");

    return (
        <div className={`group rounded-xl border border-gray-200 bg-white p-5 flex flex-col justify-between h-full min-h-[320px] hover:shadow-lg transition-all duration-300 relative overflow-hidden`}>

            <div className="space-y-4">
                {/* Header: Icon + Encrypted Badge (Always visible) */}
                <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-blue-50 text-blue-500`}>
                        <FileText size={20} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-full border border-gray-100">
                            <Lock size={10} /> Encrypted
                        </div>
                        <div className={`text-[10px] font-medium px-2 py-1 rounded-full border ${report.uploaded_by === "DOCTOR" ? "border-green-100 bg-green-50 text-green-600" : "border-yellow-100 bg-yellow-50 text-yellow-600"}`}>
                            {report.uploaded_by === "DOCTOR" ? "🟢 Verified Doctor" : "🟡 Patient Uploaded"}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div>
                    <h3 className="font-bold text-gray-900 truncate text-base leading-tight" title={report.report_id}>
                        {report.report_id}
                    </h3>
                    <p className="text-sm text-gray-500 mt-2 min-h-[40px]">
                        {report.summary || "No summary available"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{report.filename}</p>
                    <div className="text-[10px] text-gray-400 mt-1">
                        {new Date(report.created_at).toLocaleDateString()}
                    </div>
                </div>

                {/* Access Boxes */}
                {isShared ? (
                    <div className="space-y-3">
                        {/* Standard Access Box */}
                        {standardShares.length > 0 && (
                            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50 animate-in fade-in zoom-in-95 duration-300">
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-3 text-emerald-700">
                                    Access Granted
                                </div>
                                <div className="space-y-2">
                                    {standardShares.map((share, idx) => (
                                        <div key={idx} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                                                <UserIcon size={14} className="text-emerald-600" />
                                                <span>{share.doctorName}</span>
                                            </div>
                                            <span className="text-emerald-600 text-[10px]">
                                                {share.expiresIn}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Temporary Access Box */}
                        {tempShares.length > 0 && (
                            <div className="p-4 rounded-xl border border-yellow-100 bg-yellow-50 animate-in fade-in zoom-in-95 duration-300">
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-3 text-yellow-700">
                                    Temporary Access
                                </div>
                                <div className="space-y-2">
                                    {tempShares.map((share, idx) => (
                                        <div key={idx} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 font-bold text-sm text-yellow-900">
                                                <UserIcon size={14} className="text-yellow-600" />
                                                <span>{share.doctorName}</span>
                                            </div>
                                            <span className="text-yellow-700 text-[10px]">
                                                {share.expiresIn}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Section - Neutral */}
                        <div className="pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-1 text-gray-400">
                                Activity
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Eye size={12} />
                                <span>Viewed {perm.viewCount || 0} times</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Locked State
                    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-2 text-gray-400 text-xs transition-opacity duration-300">
                        <Lock size={12} />
                        <span>Private — Only visible to you</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
                {isShared ? (
                    <Button
                        variant="outline"
                        className="flex-1 w-full text-xs h-9 bg-white shadow-sm border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                        onClick={onManage}
                    >
                        Manage Access
                    </Button>
                ) : (
                    <a
                        href={report.presigned_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1"
                    >
                        <Button variant="outline" className="w-full text-xs h-9 bg-white hover:bg-gray-50 transition-colors">
                            View File
                        </Button>
                    </a>
                )}

                <a
                    href={report.presigned_url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 w-9 flex items-center justify-center border rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors bg-white"
                    title="Download"
                >
                    <Download size={16} />
                </a>
                <button
                    type="button"
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete();
                    }}
                    className="h-9 w-9 flex items-center justify-center border rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors bg-white"
                    title="Delete"
                >
                    <Trash2 size={15} />
                </button>
            </div>
        </div>
    );
};

const UploadCard = ({
    customReportId,
    setCustomReportId,
    reportFile,
    setReportFile,
    upload,
    uploading
}: {
    customReportId: string;
    setCustomReportId: (v: string) => void;
    reportFile: File | null;
    setReportFile: (f: File | null) => void;
    upload: () => void;
    uploading: boolean;
}) => (
    <div className="h-full min-h-[320px] border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 hover:bg-blue-50 transition-colors flex flex-col p-6 relative group animate-in fade-in zoom-in-95 duration-500">
        <div className="absolute top-3 right-3">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">New</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 mb-2 group-hover:scale-110 transition-transform duration-300">
                <Plus size={32} />
            </div>
            <div>
                <h3 className="font-bold text-blue-900">Upload New Report</h3>
                <p className="text-xs text-blue-600 mt-1 px-4">Securely encrypt and store medical documents on your personal ledger.</p>
            </div>

            <div className="w-full space-y-3 mt-4">
                <Input
                    placeholder="Report Name (e.g. Lab Results)"
                    className="bg-white"
                    value={customReportId}
                    onChange={e => setCustomReportId(e.target.value)}
                />
                <div className="relative">
                    <input
                        type="file"
                        id="file-upload"
                        className="hidden"
                        onChange={e => setReportFile(e.target.files?.[0] || null)}
                    />
                    <label
                        htmlFor="file-upload"
                        className="block w-full text-xs text-center border border-blue-200 rounded-lg p-2 bg-white text-gray-500 cursor-pointer hover:border-blue-400 truncate hover:shadow-sm transition-shadow"
                    >
                        {reportFile ? reportFile.name : "Select PDF / JPG / PNG"}
                    </label>
                </div>
            </div>
        </div>

        <div className="mt-4">
            <Button
                className="w-full"
                onClick={upload}
                disabled={uploading || !reportFile || !customReportId}
                isLoading={uploading}
            >
                {uploading ? "Encrypting..." : "Upload & Encrypt"}
            </Button>
        </div>
    </div>
);


export default function MyRecords() {
    const [reports, setReports] = useState<Report[]>([]);
    const [permissions, setPermissions] = useState<Record<number, PermissionMeta>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Upload State
    const [reportFile, setReportFile] = useState<File | null>(null);
    const [customReportId, setCustomReportId] = useState("");
    const [uploading, setUploading] = useState(false);

    // Modal State
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

    useEffect(() => {
        loadReportsAndPermissions();
    }, []);

    const loadReportsAndPermissions = async () => {
        // Optimism: Don't set global loading true on refresh if we have data
        // Only on initial
        if (reports.length === 0) setLoading(true);

        try {
            const list = await api("/reports/my");
            setReports(list);

            // Fetch both History (for report links) AND Active Sessions (for Doctor IDs)
            const [history, logs, activeSessions] = await Promise.all([
                api("/patient/access/history?include_expired=false"),
                api("/patient/reports/access-log?limit=100"),
                api("/access/patient/active") // Fix: Fetch active sessions to get doctor_ids
            ]);

            console.log("DEBUG: Raw API History", history);

            // Create Lookup for DoctorName -> DoctorID
            const doctorIdMap: Record<string, number> = {};
            if (Array.isArray(activeSessions)) {
                activeSessions.forEach((s: any) => {
                    doctorIdMap[s.doctor_name] = s.doctor_id;
                });
            }

            const newPerms: Record<number, PermissionMeta> = {};

            // Init keys
            list.forEach((r: any) => {
                newPerms[r.id] = { status: "LOCKED", shares: [] };
            });

            // View Counts
            const viewCounts: Record<string, number> = {};
            if (Array.isArray(logs)) {
                logs.forEach((l: any) => {
                    viewCounts[l.report_name] = (viewCounts[l.report_name] || 0) + 1;
                });
            }

            list.forEach((r: any) => {
                if (viewCounts[r.filename]) {
                    newPerms[r.id].viewCount = viewCounts[r.filename];
                }
            });

            if (Array.isArray(history)) {
                history.forEach((session: any) => {
                    // Check if reports are attached
                    // Relaxed Check: If it has reports, it was a granted session
                    if (session.reports && session.reports.length > 0) {

                        // Check expiry
                        let endTimeStr = session.end_time;
                        if (endTimeStr && !endTimeStr.endsWith("Z")) {
                            endTimeStr += "Z";
                        }
                        const end = new Date(endTimeStr);
                        const now = new Date();
                        const isExpired = end < now || session.status === "EXPIRED" || session.status === "REVOKED";

                        // If Revoked, we likely don't want to show it as "Access Granted" at all, maybe just drop it?
                        // User asked for "Expired status", usually implies natural expiry. 
                        // Let's filter REVOKED but keep EXPIRED.
                        if (session.status === "REVOKED") return;

                        session.reports.forEach((r: any) => {
                            const rId = Number(r.report_id); // Safety cast
                            if (newPerms[rId]) {
                                const p = newPerms[rId];
                                p.status = "SHARED"; // Even if expired, we show the card as having history? 
                                // Actually, if ALL shares are expired, maybe we shouldn't unlock the card?
                                // Layout logic: active shares unlock it. Expired shares just show in list?
                                // Let's populate shares list.

                                const diffMins = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60));
                                const expiresIn = isExpired ? "Expired" : `Expires in ${diffMins} mins`;

                                // FIX: Resolve Doctor ID from lookup
                                const validDoctorId = doctorIdMap[session.doctor_name] || 0; // fallback 0

                                // Get Access Type from Backend Check
                                // We updated backend to return r.access_type!
                                const type = r.access_type || "STANDARD";

                                // Add to shares list
                                p.shares.push({
                                    sessionId: session.session_id,
                                    doctorId: validDoctorId, // Passed to Revoke
                                    doctorName: session.doctor_name,
                                    expiresIn: expiresIn,
                                    expiryDate: end,
                                    accessType: type as "STANDARD" | "TEMPORARY",
                                    isExpired: isExpired
                                });
                            }
                        });
                    }
                });
            }

            console.log("DEBUG: Final Permissions Map", newPerms);
            setPermissions(newPerms);

        } catch (e) {
            console.error("Perms error", e);
        } finally {
            setLoading(false);
        }
    };

    const upload = async () => {
        if (!reportFile || !customReportId) {
            alert("Please select a file and enter a Report Name");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", reportFile);
            fd.append("report_id", customReportId);
            await apiForm("/reports/upload", fd);
            setReportFile(null);
            setCustomReportId("");
            loadReportsAndPermissions();
        } catch (err: any) {
            alert(err.message || "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleRevoke = async (sessionId: number, doctorId: number) => {
        if (!selectedReportId) return;

        try {
            // FIX: Use Granular Revocation Endpoint
            // Using correct api signature from previous fix
            await api("/access/reports/revoke", {
                method: "POST",
                body: JSON.stringify({
                    session_id: sessionId,
                    report_id: selectedReportId
                })
            });

            // Refresh logic
            await loadReportsAndPermissions();
            // We consciously DO NOT close the modal, so user sees the granular removal happen.

        } catch (e: any) {
            console.error("Revoke failed", e);
            alert(e.message || "Revocation failed. Note: You can only revoke individual access for sessions that have specific report grants.");
        }
    };

    const handleDelete = async (reportId: number) => {
        if (!window.confirm("Delete this report permanently?")) return;

        try {
            await api(`/reports/${reportId}`, { method: "DELETE" });
            setReports((current) => current.filter((report) => report.id !== reportId));
            setPermissions((current) => {
                const next = { ...current };
                delete next[reportId];
                return next;
            });
            await loadReportsAndPermissions();
        } catch (e: any) {
            alert(e.message || "Delete failed.");
        }
    };

    const filteredReports = reports.filter(r =>
        r.report_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Get active report's shares safely
    const activeReportShares = selectedReportId && permissions[selectedReportId]
        ? permissions[selectedReportId].shares
        : [];

    const activeReportName = selectedReportId
        ? reports.find(r => r.id === selectedReportId)?.report_id
        : "";

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
            {/* Header - Updated Text */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        Medical Reports
                        <button
                            onClick={loadReportsAndPermissions}
                            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Refresh Data"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </h1>
                    <p className="text-gray-500 mt-1">You control who can access each report and for how long.</p>
                </div>

                <div className="w-full md:w-72">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search reports by name..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="absolute left-3 top-3 text-gray-400">
                            <Search size={16} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Pending Requests List - Passed Callback for Auto Refresh */}
            <PendingRequestsList onActionComplete={loadReportsAndPermissions} />

            {/* Grid */}
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch animate-in fade-in duration-700 slide-in-from-bottom-4`}>

                {/* Only show UploadCard if NOT searching */}
                {!searchQuery && (
                    <UploadCard
                        customReportId={customReportId}
                        setCustomReportId={setCustomReportId}
                        reportFile={reportFile}
                        setReportFile={setReportFile}
                        upload={upload}
                        uploading={uploading}
                    />
                )}

                {loading && reports.length === 0 ? (
                    // Skeleton Loaders
                    [1, 2, 3].map(i => (
                        <div key={i} className="h-[320px] bg-gray-100 rounded-xl animate-pulse" />
                    ))
                ) : (
                    filteredReports.map(r => (
                        <ReportCard
                            key={r.id}
                            report={r}
                            perm={permissions[r.id] || { status: "LOCKED", shares: [] }}
                            onManage={() => {
                                setSelectedReportId(r.id);
                                setIsManageOpen(true);
                            }}
                            onDelete={() => handleDelete(r.id)}
                        />
                    ))
                )}
            </div>

            {/* No Results matched Search */}
            {filteredReports.length === 0 && !loading && searchQuery && (
                <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 animate-in fade-in zoom-in-95">
                    <div className="text-gray-400 mb-2">
                        <Search size={24} className="mx-auto" />
                    </div>
                    <p className="text-gray-500">No reports match "{searchQuery}"</p>
                    <button
                        onClick={() => setSearchQuery("")}
                        className="text-blue-600 text-sm font-medium mt-2 hover:underline"
                    >
                        Clear search
                    </button>
                </div>
            )}

            {reports.length === 0 && !loading && (
                <div className="text-center py-10 text-gray-400 italic">
                    No reports yet. Upload your first one!
                </div>
            )}

            {/* Manage Access Modal */}
            <ManageAccessModal
                isOpen={isManageOpen}
                onClose={() => setIsManageOpen(false)}
                reportName={activeReportName || "Report"}
                shares={activeReportShares}
                onRevoke={handleRevoke}
            />
        </div>
    );
}
