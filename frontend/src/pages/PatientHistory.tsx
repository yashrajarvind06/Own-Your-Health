import React, { useState, useEffect } from "react";
import { api } from "../api";

// Helper for date formatting
// Helper for date formatting
const formatDate = (dateStr: string) => {
    try {
        if (!dateStr) return "N/A";
        // Ensure UTC interpretation if naive
        const safeDate = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;
        return new Date(safeDate).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    } catch (e) { return dateStr || "Invalid Date"; }
};

const formatTime = (dateStr: string) => {
    try {
        if (!dateStr) return "";
        const safeDate = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;
        return new Date(safeDate).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    } catch (e) { return ""; }
};

// Reusing Button component or basic styles
const Badge = ({ type, text }: { type: string, text: string }) => {
    const colors: any = {
        "NORMAL": "bg-green-100 text-green-800 border-green-200",
        "EMERGENCY": "bg-red-100 text-red-800 border-red-200",
        "ACTIVE": "bg-blue-100 text-blue-800 border-blue-200",
        "EXPIRED": "bg-gray-100 text-gray-600 border-gray-200",
        "REVOKED": "bg-orange-100 text-orange-800 border-orange-200"
    };
    return (
        <span className={`px-2 py-1 rounded text-xs font-semibold border ${colors[type] || "bg-gray-100 text-gray-800"}`}>
            {text}
        </span>
    );
};

// Use existing imports...

export default function PatientHistory() {
    const [viewMode, setViewMode] = useState<"sessions" | "reports" | "emergency">("sessions");
    const [sessions, setSessions] = useState<any[]>([]);
    const [reportLogs, setReportLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        loadData();
    }, [viewMode]);

    const loadData = async () => {
        setLoading(true);
        setError("");
        try {
            if (viewMode === "sessions") {
                const res = await api("/patient/access/history?limit=50");
                if (Array.isArray(res)) setSessions(res);
                else throw new Error("Invalid session data");
            } else if (viewMode === "reports" || viewMode === "emergency") {
                const res = await api("/patient/reports/access-log");
                if (Array.isArray(res)) setReportLogs(res);
                else throw new Error("Invalid report log data");
            }
        } catch (e: any) {
            console.error("Fetch failed", e);
            setError(e.message || "Failed to load data.");
        } finally {
            setLoading(false);
        }
    };

    // ... return logic
    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Access Audit Log</h1>
                        <p className="text-sm text-gray-500">Secure chronological record of all medical data access.</p>
                    </div>
                    <a href="/patient" className="text-blue-600 hover:underline text-sm font-medium">
                        ← Back to Dashboard
                    </a>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-4 border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setViewMode("sessions")}
                        className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${viewMode === "sessions" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                        Session Timeline
                    </button>
                    <button
                        onClick={() => setViewMode("reports")}
                        className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${viewMode === "reports" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                        Report Permissions
                    </button>
                    <button
                        onClick={() => setViewMode("emergency")}
                        className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${viewMode === "emergency" ? "border-amber-500 text-amber-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                        Emergency Views
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="text-center py-10 text-gray-500">Loading secure history...</div>
                ) : error ? (
                    <div className="p-10 text-center text-red-600">Error: {error}</div>
                ) : (
                    <>
                        {/* SESSION TIMELINE VIEW */}
                        {viewMode === "sessions" && (
                            sessions.length === 0 ? (
                                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500">No session history found.</div>
                            ) : (
                                <div className="space-y-4">
                                    {sessions.map((s, i) => (
                                        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                                            {/* Existing Card Content Copy-Paste... */}
                                            <div className="p-5">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                                                            {s.doctor_name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-gray-900">{s.doctor_name}</div>
                                                            <div className="text-xs text-gray-500">ID: {s.session_id} • {formatDate(s.start_time)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <Badge type={s.access_type} text={s.access_type === 'EMERGENCY' ? '🚨 EMERGENCY' : 'NORMAL'} />
                                                        <Badge type={s.status} text={s.status} />
                                                    </div>
                                                </div>
                                                <div className="border-t border-gray-50 my-3"></div>
                                                <div className="grid md:grid-cols-2 gap-4 text-sm">
                                                    <div className="space-y-2">
                                                        <div>
                                                            <span className="text-gray-500 block text-xs uppercase tracking-wide font-medium">Access Reason</span>
                                                            <div className="font-medium text-gray-800">
                                                                {(s.reason === "General Consent" || s.reason === "CONSENT") ? "✨ Approved by you" : s.reason}
                                                            </div>
                                                        </div>
                                                        <div><span className="text-gray-500 block text-xs uppercase tracking-wide font-medium">Duration</span><div className="text-gray-700">{formatTime(s.start_time)} → {formatTime(s.end_time)}</div></div>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500 block text-xs uppercase tracking-wide font-medium mb-1">Reports Accessed</span>
                                                        {s.reports.length === 0 ? (
                                                            <div className="text-gray-400 italic">
                                                                No reports unlocked
                                                                {s.access_type === 'EMERGENCY' && (
                                                                    <div className="text-xs text-blue-600 mt-1 not-italic">
                                                                        (Emergency access is limited to life-saving information only)
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-2">{s.reports.map((r: any, idx: number) => <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-700 text-xs">📄 {r.report_name}</span>)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`h-1 w-full ${s.access_type === 'EMERGENCY' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* REPORT PERMISSIONS VIEW (Filtered) */}
                        {viewMode === "reports" && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                            <tr>
                                                <th className="px-4 py-3">Report</th>
                                                <th className="px-4 py-3">Accessed By</th>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3">Action</th>
                                                <th className="px-4 py-3">Time</th>
                                                <th className="px-4 py-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {reportLogs.filter(l => l.report_name !== "Emergency Profile").length === 0 ? (
                                                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">No report access events found.</td></tr>
                                            ) : reportLogs.filter(l => l.report_name !== "Emergency Profile").map((log, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-gray-900">📄 {log.report_name}</td>
                                                    <td className="px-4 py-3 text-gray-700">{log.accessed_by}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${log.access_type === 'EMERGENCY' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                                                            {log.access_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {log.status === 'VIEWED' ? (
                                                            <span className="text-blue-600 font-medium">👁 Viewed</span>
                                                        ) : (
                                                            <span className="text-gray-500">🔓 Granted (Not Viewed)</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(log.accessed_at)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${log.status === 'EXPIRED' ? 'bg-gray-100 text-gray-500' : log.status === 'REVOKED' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{log.status_label}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* EMERGENCY VIEW (Filtered) */}
                        {viewMode === "emergency" && (
                            <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
                                <div className="p-4 bg-amber-50 border-b border-amber-100 text-amber-800 text-sm">
                                    These logs show when your **Emergency Medical Information** (Allergies, Blood Type) was viewed by a doctor.
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-amber-50/50 text-xs uppercase text-amber-900/60 font-semibold">
                                            <tr>
                                                <th className="px-4 py-3">Information</th>
                                                <th className="px-4 py-3">Accessed By</th>
                                                <th className="px-4 py-3">Access Mode</th>
                                                <th className="px-4 py-3">Time</th>
                                                <th className="px-4 py-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-100">
                                            {reportLogs.filter(l => l.report_name === "Emergency Profile").length === 0 ? (
                                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">No emergency views recorded.</td></tr>
                                            ) : reportLogs.filter(l => l.report_name === "Emergency Profile").map((log, i) => (
                                                <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        <span className="flex items-center gap-2 text-amber-700">
                                                            🚨 Emergency Profile
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{log.accessed_by}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${log.access_type === 'EMERGENCY' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                                                            {log.access_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-amber-900/70 whitespace-nowrap">{formatDate(log.accessed_at)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                                            Accessed
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
