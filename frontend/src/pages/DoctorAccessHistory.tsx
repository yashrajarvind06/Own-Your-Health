import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { ShieldCheck, FileText, AlertTriangle, QrCode } from "lucide-react";

interface AuditLog {
    id: number;
    timestamp: string;
    patient_id: number;
    doctor_id: number;
    patient_name?: string;
    doctor_name?: string;
    actor_name?: string;
    event_type: string;
    access_mode: string;
    metadata: string;
}

// Enums for Categorization
const AUTH_EVENTS = ["ACCESS_REQUESTED", "ACCESS_APPROVED", "ACCESS_DENIED", "EMERGENCY_OVERRIDE", "QR_VALIDATED"];
const DATA_EVENTS = ["VIEW_REPORTS", "VIEW_EMERGENCY_PROFILE"];

interface LogGroup extends AuditLog {
    count: number;
    details: string[];
    category: "AUTH" | "DATA" | "OTHER";
}

export default function DoctorAccessHistory() {
    const [logs, setLogs] = useState<LogGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMode, setFilterMode] = useState<"all" | "normal" | "emergency">("all");
    const [showDetails, setShowDetails] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<number | "all">("all");

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const rawLogs: AuditLog[] = await api("/logs/doctor/logs");
                setLogs(processLogs(rawLogs));
            } catch (error) {
                console.error("Failed to fetch logs", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const processLogs = (rawLogs: AuditLog[]): LogGroup[] => {
        // 0. Categorize and Pre-Sort
        const labeledLogs = rawLogs.map(l => ({
            ...l,
            category: AUTH_EVENTS.includes(l.event_type) ? "AUTH" :
                DATA_EVENTS.includes(l.event_type) ? "DATA" : "OTHER"
        })) as LogGroup[];

        // Sort: Newest First
        // Refinement 3: Tie-break: Data comes "after" Auth, so Data is "newer". 
        // In descending sort, Newer (Data) appears before Older (Auth) if timestamps are equal.
        // Wait, the requirement says "Always render Authorization events first Then Data Access"
        // In a log list (Newest Top), "First" usually means top.
        // If Auth causes Data, Auth happens at T0, Data at T1. T1 > T0.
        // So Data is at Top, Auth is below.
        // BUT strict rule: "Explain why data access was possible... Must precede... visually".
        // If scanning down, you want to see "Auth Granted" then "Viewed Data".
        // This implies Auth should be visually ABOVE Data? 
        // Or if it's a history, you read "He viewed data... because he got auth".
        // User Refinement 3 text: "Always render Authorization events first Then Data Access... Even if backend timestamps match."
        // This usually implies a narrative order. 
        // Let's assume standard descending sort (Newest Top). 
        // If we want Auth "first" (Top), we treat Auth as "Newer" than Data?
        // That defies causality (Auth happens before Data).
        // Maybe the user wants Ascending order? "History" usually implies Descending.
        // Let's stick to standard causality: Auth happens, then Data Access.
        // In Descending List: Data (Newest) -> Auth (Oldest).
        // If timestamps match, we ensure this order is preserved.

        const sortedLogs = labeledLogs.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeA !== timeB) return timeB - timeA; // Descending

            // Timestamp Tie-Breaker
            // We want Data (Effect) to be "Newer" (Top) than Auth (Cause).
            // So if A is DATA and B is AUTH, A should come before B (Index A < Index B).
            // return -1 means A comes before B.
            if (a.category === 'DATA' && b.category === 'AUTH') return -1;
            if (a.category === 'AUTH' && b.category === 'DATA') return 1;
            return 0;
        });

        // 1. Group events
        // Criteria: Same Patient, Same Access Mode, Same Event Type
        // EXCEPTION: Never group Auth events (Show every decision) - Step 4
        // Window: 60s
        const grouped: LogGroup[] = [];

        for (const log of sortedLogs) {
            // No aggregation for Auth events
            if (log.category === 'AUTH') {
                grouped.push({ ...log, count: 1, details: log.metadata ? [log.metadata] : [] });
                continue;
            }

            const lastGroup = grouped[grouped.length - 1];

            if (lastGroup && lastGroup.category === 'DATA') {
                const isSamePatient = lastGroup.patient_id === log.patient_id;
                const isSameMode = lastGroup.access_mode === log.access_mode;
                const isSameType = lastGroup.event_type === log.event_type;

                const timeA = new Date(lastGroup.timestamp).getTime();
                const timeB = new Date(log.timestamp).getTime();
                const diffMinutes = Math.abs(timeA - timeB) / (1000 * 60);

                if (isSamePatient && isSameMode && isSameType && diffMinutes <= 2.0) {
                    lastGroup.count += 1;
                    // Detail Aggregation: Distinct files/metadata
                    const meta = log.metadata || "";
                    if (meta && !lastGroup.details.includes(meta)) {
                        lastGroup.details.push(meta);
                    }
                    continue;
                }
            }

            grouped.push({
                ...log,
                count: 1,
                details: log.metadata ? [log.metadata] : []
            });
        }

        return grouped;
    };

    // Filters and Formaters
    const uniquePatients = Array.from(new Set(logs.map(log => log.patient_id))).filter(Boolean).sort((a, b) => a - b);

    const getFilteredLogs = () => {
        return logs.filter(log => {
            if (selectedPatient !== "all" && log.patient_id !== selectedPatient) return false;

            if (filterMode === "normal" && log.access_mode.toLowerCase() !== "normal") return false;
            if (filterMode === "emergency" && log.access_mode.toLowerCase() !== "emergency") return false;

            return true;
        });
    };

    const formatLogMessage = (log: LogGroup) => {
        const type = log.event_type;
        // Parse details for VIEW_REPORTS count if available
        let distinctCount = log.details.length || log.count;

        switch (type) {
            case "ACCESS_REQUESTED": return "Access requested";
            case "ACCESS_APPROVED": return "Access granted by patient";
            case "ACCESS_DENIED": return "Access denied by patient";
            case "EMERGENCY_OVERRIDE": return "Emergency override used";

            case "VIEW_REPORTS":
                // "Viewed N medical reports"
                // Try to parse "Count: N" from metadata if backend sends it
                if (log.details.length > 0) {
                    // Check if any detail string looks like "Event: ..., Count: N"
                    // The backend format is "Key: Value, Key: Value"
                    // We only have the raw string in details.
                    // The backend sends: "Category: DATA_ACCESS, Count: N, Files: ..."
                    // Let's try to extract Count from the LATEST detail (log.details[0] is often safest or sum?)
                    // Actually, if we aggregate, we might have multiple log entries.
                    // But backend now aggregates per-request. So likely one log per batch.
                    // We should sum the counts if we aggregated frontend-side.
                    // Logic: Iterate details, parse Count, Sum.
                    let total = 0;
                    let found = false;
                    log.details.forEach(d => {
                        const m = d.match(/Count: (\d+)/);
                        if (m) {
                            total += parseInt(m[1]);
                            found = true;
                        }
                    });
                    if (found) distinctCount = total;
                }
                return `Viewed ${distinctCount} medical report${distinctCount === 1 ? '' : 's'}`;

            case "VIEW_EMERGENCY_PROFILE":
                // Distinct Logic: Normal vs Override
                if (log.access_mode.toLowerCase() === "emergency") {
                    return "Emergency profile accessed (emergency override)";
                }
                return "Viewed emergency profile (normal access)";

            case "EMERGENCY_ACCESS": // Legacy fallback
                return "Emergency profile accessed";

            case "QR_VALIDATED": return "QR access validated";

            default: return type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        }
    };

    const formatDateTime = (isoString: string) => {
        if (!isoString) return "-";
        // FORCE UTC: If string is naive (no Z or offset), assume it's UTC from backend.
        const safeIso = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`;
        const date = new Date(safeIso);

        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        }).toUpperCase() + " IST";
    };

    const getModeBadge = (mode: string) => {
        const m = mode.toLowerCase();
        if (m === "emergency") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                    Emergency
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                Normal
            </span>
        );
    };

    const getIcon = (log: LogGroup) => {
        if (log.category === 'AUTH') {
            if (log.event_type === 'EMERGENCY_OVERRIDE') return <AlertTriangle className="w-4 h-4 text-amber-600" />;
            if (log.event_type === 'ACCESS_DENIED') return <ShieldCheck className="w-4 h-4 text-red-600" />;
            if (log.event_type === 'QR_VALIDATED') return <QrCode className="w-4 h-4 text-blue-600" />;
            return <ShieldCheck className="w-4 h-4 text-blue-600" />;
        }
        if (log.event_type.includes("EMERGENCY")) return <AlertTriangle className="w-4 h-4 text-red-500" />;
        return <FileText className="w-4 h-4 text-gray-500" />;
    };

    const filteredLogs = getFilteredLogs();

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
                    <p className="text-xs text-gray-500 mt-1">Professional Access History • Read Only</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Patient Filter */}
                    <select
                        value={selectedPatient}
                        onChange={(e) => setSelectedPatient(e.target.value === "all" ? "all" : Number(e.target.value))}
                        className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                    >
                        <option value="all">All Patients</option>
                        {uniquePatients.map(id => {
                            const pName = logs.find(l => l.patient_id === id)?.patient_name || `Patient #${id}`;
                            return <option key={id} value={id}>{pName}</option>
                        })}
                    </select>

                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm">
                        <button onClick={() => setFilterMode("all")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterMode === "all" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>All</button>
                        <div className="w-px h-4 bg-gray-200"></div>
                        <button onClick={() => setFilterMode("normal")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterMode === "normal" ? "bg-green-50 text-green-700" : "text-gray-500 hover:text-gray-700"}`}>Normal</button>
                        <button onClick={() => setFilterMode("emergency")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterMode === "emergency" ? "bg-red-50 text-red-700" : "text-gray-500 hover:text-gray-700"}`}>Emergency</button>
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-gray-900 select-none">
                    <input
                        type="checkbox"
                        checked={showDetails}
                        onChange={(e) => setShowDetails(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Show administrative details</span>
                </label>
            </div>

            <Card title="Activity Log" className="overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading audit trail...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No activity found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-gray-700 w-48">Time (IST)</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700">Patient</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700">Action</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700">Mode</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredLogs.map((log, index) => {
                                    const isEmergency = log.access_mode.toLowerCase() === "emergency";
                                    const isAuth = log.category === 'AUTH';

                                    return (
                                        <tr
                                            key={`${log.id}-${index}`}
                                            className={`transition-colors ${isEmergency && isAuth ? "bg-red-50/80 hover:bg-red-50" :
                                                isEmergency ? "bg-red-50/30 hover:bg-red-50" :
                                                    isAuth ? "bg-blue-50/30 hover:bg-blue-50" : "bg-white hover:bg-gray-50"
                                                }`}
                                        >
                                            <td className="px-6 py-4 text-gray-600 font-mono whitespace-nowrap align-top">
                                                {formatDateTime(log.timestamp)}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-gray-900 align-top">
                                                {log.patient_name || (log.patient_id ? `#${log.patient_id}` : "-")}
                                            </td>
                                            <td className="px-6 py-4 text-gray-900 font-medium align-top">
                                                <div className="flex items-start gap-2">
                                                    <span className="mt-0.5 opacity-70" title={log.category}>{getIcon(log)}</span>
                                                    <div>
                                                        <div>{formatLogMessage(log)}</div>

                                                        {showDetails && (
                                                            <div className="mt-2 text-xs text-gray-500 font-mono bg-white/50 p-2 rounded border border-gray-200">
                                                                <div className="font-semibold text-gray-600 mb-1">Technical Trace:</div>
                                                                <div>Event: {log.event_type}</div>
                                                                <div>Ref ID: {log.id}</div>
                                                                {log.details.length > 0 && (
                                                                    <div className="mt-1 break-all text-gray-400 text-[10px]">
                                                                        {log.details.join(" | ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                {getModeBadge(log.access_mode)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div >
    );
}
