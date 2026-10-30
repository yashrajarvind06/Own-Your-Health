import { useState, useEffect } from "react";
import { api, fileUrl } from "../api";
import { Button } from "./ui/Button";
import { Lock, FileText, XCircle, Clock, Timer, Ban } from "lucide-react";
import { ACCESS_PURPOSES } from "../purposes";
import { AiChip, AiValues, CompareModal, PatientSummaryPanel, ReportNotes, TrustBadge, type AiDetails, type CompareItem } from "./DoctorRecordTools";

type ReportStatus = "LOCKED" | "UNLOCKED" | "PENDING" | "DENIED" | "REVOKED" | "EXPIRED";

interface DoctorReportListProps {
    patientId: number;
    sessionId: number;
    showSummary?: boolean; // the dashboard shows the snapshot in its own card
}

type ReportItem = CompareItem & {
    created_at?: string;
    uploaded_by?: "PATIENT" | "DOCTOR" | "LAB";
    trust_badge?: string;
    reviewed_at?: string | null;
    relevant?: boolean;
    ai_summary?: string | null;
    ai_details?: AiDetails | null;
};

export default function DoctorReportList({ patientId, sessionId, showSummary = true }: DoctorReportListProps) {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [accessMap, setAccessMap] = useState<Record<number, ReportStatus>>({});

    // Store Expiry AND Type
    const [activeAccessData, setActiveAccessData] = useState<Record<number, { expires_at: string, access_type: string }>>({});

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal State
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isRequestOpen, setIsRequestOpen] = useState(false);
    const [accessReason, setAccessReason] = useState("TREATMENT");
    const [showOlder, setShowOlder] = useState(false);
    const [compareIds, setCompareIds] = useState<number[]>([]);
    const [comparing, setComparing] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [compareMode, setCompareMode] = useState(false);

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
        // Open the tab now, inside the tap: phone browsers block window.open after an await
        const tab = window.open("", "_blank");
        try {
            const res = await api("/reports/access", {
                method: "POST",
                body: JSON.stringify({ report_ids: [reportId] })
            });
            if (!res?.[0]?.url) throw new Error("no url");
            if (tab) tab.location.href = fileUrl(res[0].url);
            else window.location.href = fileUrl(res[0].url);
        } catch (e: any) {
            tab?.close();
            alert("Couldn't open this report. Your access may have ended.");
        }
    };

    const getTimeRemaining = (expiry: string) => {
        if (!expiry) return null;
        const diff = new Date(expiry).getTime() - new Date().getTime();
        const mins = Math.ceil(diff / 60000);
        return mins > 0 ? `${mins}m` : "Expiring...";
    };

    if (loading) return <div className="p-6 text-center text-sm text-slate-500">Loading records…</div>;
    if (error) return <div className="p-6 text-center text-sm text-red-600">Couldn't load records: {error}</div>;
    if (reports.length === 0) return <div className="space-y-3">{showSummary && <PatientSummaryPanel patientId={patientId} />}<div className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200/70">This patient has no records yet.</div></div>;

    // docx relevance decay: old records sink, fade and need a click to expand
    const current = reports.filter(r => r.relevant !== false);
    const older = reports.filter(r => r.relevant === false);
    const toggleCompare = (id: number) =>
        setCompareIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-2));
    const selected = reports.find(r => r.id === selectedId) ?? null;
    const selectedStatus: ReportStatus = selected ? accessMap[selected.id] || "LOCKED" : "LOCKED";
    const askAccess = (r: ReportItem) => { setSelectedReport(r); setIsRequestOpen(true); };

    const renderReport = (r: ReportItem, faded: boolean, last: boolean) => {
        const status = accessMap[r.id] || "LOCKED";
        const accessInfo = activeAccessData[r.id];
        const temp = status === "UNLOCKED" && accessInfo?.access_type === "TEMPORARY";
        const pill = STATUS_PILL[status];
        const isSel = selectedId === r.id;
        const pick = () => (compareMode ? status === "UNLOCKED" && toggleCompare(r.id) : setSelectedId(r.id));
        return (
            <div key={r.id} role="button" tabIndex={0} aria-pressed={isSel} onClick={pick}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${isSel ? "bg-blue-50" : "hover:bg-slate-50"} ${last ? "" : "border-b border-slate-100"} ${faded ? "opacity-60" : ""}`}>
                {compareMode && (
                    <input type="checkbox" className="mt-2.5 h-4 w-4 accent-blue-600" disabled={status !== "UNLOCKED"} aria-label={`Compare ${r.record_type || r.filename}`}
                        checked={compareIds.includes(r.id)} readOnly tabIndex={-1} />
                )}
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileText size={18} /></div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-slate-900">{r.record_type || r.filename}</span>
                        <span className="shrink-0 text-xs text-slate-500">{(r.record_date || r.created_at || "").split("T")[0]}</span>
                    </div>
                    <div className="truncate text-sm text-slate-600">{r.one_line_summary || r.filename}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>
                            {temp ? <Timer size={12} /> : pill.icon}{temp ? `Temporary · ${getTimeRemaining(accessInfo?.expires_at || "")}` : pill.label}
                        </span>
                        <TrustBadge badge={r.trust_badge} />
                        {r.ai_summary && <AiChip />}
                    </div>
                </div>
                {status === "LOCKED" && !compareMode && (
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); askAccess(r); }}>Request</Button>
                )}
            </div>
        );
    };

    const vitals = Object.entries(selected?.vitals ?? {}).filter(([, v]) => v !== null && v !== "");

    return (
        <div className="space-y-3">
            {showSummary && <PatientSummaryPanel patientId={patientId} />}
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-500">{reports.length} record{reports.length > 1 ? "s" : ""} · newest first</span>
                <div className="flex items-center gap-2">
                    {compareMode && <Button size="sm" disabled={compareIds.length !== 2} onClick={() => setComparing(true)}>Compare {compareIds.length}/2</Button>}
                    <Button size="sm" variant="outline" onClick={() => { setCompareMode(!compareMode); setCompareIds([]); }}>{compareMode ? "Done" : "Select to compare"}</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
                        {current.map((r, i) => renderReport(r, false, i === current.length - 1))}
                        {current.length === 0 && <div className="p-4 text-sm text-slate-500">No recent records.</div>}
                    </div>
                    {older.length > 0 && (
                        <button className="w-full rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => setShowOlder(!showOlder)}>
                            {showOlder ? "Hide" : "Show"} {older.length} older · less relevant
                        </button>
                    )}
                    {showOlder && older.length > 0 && (
                        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">{older.map((r, i) => renderReport(r, true, i === older.length - 1))}</div>
                    )}
                </div>

                {/* Inspector: the selected record's values and doctor-only notes */}
                <aside className="h-fit rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200/70 xl:sticky xl:top-4" aria-label="Record details">
                    {!selected ? (
                        <div className="py-10 text-center text-slate-500">Select a record to see its values and your notes.</div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <div className="text-base font-bold text-slate-900">{selected.record_type || selected.filename}</div>
                                <div className="break-all text-slate-500">{(selected.record_date || selected.created_at || "").split("T")[0]} · {selected.filename}</div>
                            </div>
                            <TrustBadge badge={selected.trust_badge} />
                            {selected.one_line_summary && <p className="text-slate-700">{selected.one_line_summary}</p>}
                            {selected.ai_details && (
                                <div className="space-y-3 rounded-xl bg-violet-50/60 p-3">
                                    <AiChip />
                                    <p className="text-slate-800">{selected.ai_details.summary}</p>
                                    <AiValues values={selected.ai_details.values} />
                                </div>
                            )}
                            {!selected.ai_details && vitals.length > 0 && (
                                <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50">
                                    {vitals.map(([k, v]) => (
                                        <div key={k} className="flex justify-between gap-3 px-3 py-2"><dt className="capitalize text-slate-500">{k.replace(/_/g, " ")}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>
                                    ))}
                                </dl>
                            )}
                            {selectedStatus === "UNLOCKED" ? (
                                <>
                                    <Button className="w-full" onClick={() => openReport(selected.id)}>Open file</Button>
                                    <ReportNotes reportId={selected.id} reviewed={!!selected.reviewed_at} onReviewed={loadData} />
                                </>
                            ) : selectedStatus === "LOCKED" ? (
                                <Button className="w-full" variant="outline" onClick={() => askAccess(selected)}>Request access to this record</Button>
                            ) : (
                                <div className="rounded-lg bg-slate-50 p-3 text-slate-600">{STATUS_PILL[selectedStatus].label} — the file isn't available in this session.</div>
                            )}
                        </div>
                    )}
                </aside>
            </div>
            {comparing && <CompareModal items={reports.filter(r => compareIds.includes(r.id))} onClose={() => setComparing(false)} />}

            {isRequestOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="req-title"
                    onKeyDown={e => e.key === "Escape" && setIsRequestOpen(false)}>
                    <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <button className="rounded px-1 text-blue-600 hover:underline" onClick={() => setIsRequestOpen(false)}>Cancel</button>
                            <h3 id="req-title" className="font-bold text-slate-900">Request access</h3>
                            <button className="rounded px-1 font-bold text-blue-600 hover:underline" onClick={handleRequestAccess}>Send</button>
                        </div>
                        <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-900">{selectedReport?.record_type || selectedReport?.filename}</span><br />
                            <Clock size={12} className="mr-1 inline" />Temporary access that expires automatically. The patient sees your purpose.
                        </p>
                        <label className="block text-sm font-medium text-slate-700">Purpose
                            <select autoFocus className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={accessReason} onChange={e => setAccessReason(e.target.value)}>
                                {ACCESS_PURPOSES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                            </select>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

const STATUS_PILL: Record<ReportStatus, { label: string; cls: string; icon: JSX.Element }> = {
    UNLOCKED: { label: "Open", cls: "bg-emerald-50 text-emerald-700", icon: <FileText size={12} /> },
    LOCKED: { label: "Locked", cls: "bg-slate-100 text-slate-600", icon: <Lock size={12} /> },
    PENDING: { label: "Requested", cls: "bg-amber-50 text-amber-800", icon: <Clock size={12} /> },
    DENIED: { label: "Denied", cls: "bg-red-50 text-red-700", icon: <XCircle size={12} /> },
    REVOKED: { label: "Revoked", cls: "bg-red-50 text-red-700", icon: <Ban size={12} /> },
    EXPIRED: { label: "Expired", cls: "bg-slate-100 text-slate-500", icon: <Timer size={12} /> },
};
