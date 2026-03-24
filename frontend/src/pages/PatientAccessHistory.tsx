import { useEffect, useState } from "react";
import { api } from "../api";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Shield, QrCode } from "lucide-react";

// --- Types ---
interface AuditLog {
    id: number;
    timestamp: string;
    patient_id: number;
    doctor_id: number | null;
    doctor_name: string;
    event_type: string;
    access_mode: string;
    access_context?: string; // Added from BE
    access_reason?: string;  // Added Phase 2
    actor_role: string;
    actor_name: string;
    report_id?: string;
}

type GroupType = "EMERGENCY" | "NORMAL" | "TECHNICAL" | "DENIED";

interface TimelineGroup {
    id: string; // unique key
    type: GroupType;
    doctor_name: string;
    doctor_id: number | null;
    anchorTime: string; // The "effective" time of the event cluster
    logs: AuditLog[];
    // Risk & Trust Signals
    hasOverride: boolean;
    hasProfileView: boolean;
    hasReportView: boolean;
}

//Labels for Details Panel
const EVENT_DESCRIPTIONS: Record<string, string> = {
    EMERGENCY_OVERRIDE: "Emergency Override Activated",
    VIEW_EMERGENCY_PROFILE: "Viewed Emergency Profile",
    ACCESS_APPROVED: "Access Granted by Patient",
    VIEW_REPORTS: "Viewed Medical Record",
    ACCESS_DENIED: "Access Denied",
    ACCESS_REQUESTED: "Access Requested",
    QR_VALIDATED: "QR Code Scanned"
};

const REASON_LABELS: Record<string, string> = {
    'FOLLOW_UP': 'Follow-up consultation',
    'DIAGNOSTIC': 'Diagnostic review',
    'MEDICATION': 'Medication review',
    'PROCEDURE': 'Procedure preparation',
    'EMERGENCY_EVAL': 'Emergency evaluation',
    'OTHER': 'Other reason'
};

export default function PatientAccessHistory() {
    const [timeline, setTimeline] = useState<TimelineGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTechnical, setShowTechnical] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            const rawLogs: AuditLog[] = await api("/logs/patient/logs");
            const processed = processLogs(rawLogs);
            setTimeline(processed);
        } catch (error) {
            console.error("Failed to fetch logs", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Helpers ---
    // Robust date parsing to handle backend inconsistencies (missing Z for UTC)
    const parseDate = (isoString: string): Date => {
        if (!isoString) return new Date();
        const safeIso = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`;
        return new Date(safeIso);
    };

    const formatTime = (isoString: string) => {
        if (!isoString) return "";
        return parseDate(isoString).toLocaleString('en-IN', {
            hour: 'numeric', minute: '2-digit', hour12: true
        }).toUpperCase();
    };

    const formatDate = (isoString: string) => {
        if (!isoString) return "";
        return parseDate(isoString).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    const getRelativeTime = (isoString: string) => {
        if (!isoString) return "";
        const date = parseDate(isoString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return "Just now";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
        return formatDate(isoString);
    };

    // --- Core Grouping Logic ---
    const processLogs = (rawLogs: AuditLog[]): TimelineGroup[] => {
        if (!rawLogs || rawLogs.length === 0) return [];

        // 1. Sort ASCENDING using robust parser
        const sorted = [...rawLogs].sort((a, b) =>
            parseDate(a.timestamp).getTime() - parseDate(b.timestamp).getTime()
        );

        const groups: TimelineGroup[] = [];

        for (const log of sorted) {
            // STEP 4: Strict Technical Suppression (Filter out purely internal noise)
            const ignoredEvents = ['EMERGENCY_PROFILE_CREATED', 'QR_GENERATED'];
            if (ignoredEvents.includes(log.event_type) || log.event_type.startsWith('SYSTEM_')) {
                continue;
            }

            // Smart Grouping: Search backwards for the last group belonging to this doctor
            let targetGroup: TimelineGroup | undefined;

            // Look back at the last 3 groups
            for (let i = groups.length - 1; i >= 0 && i >= groups.length - 3; i--) {
                const g = groups[i];
                const sameId = g.doctor_id && log.doctor_id && String(g.doctor_id) === String(log.doctor_id);
                // Also match strictly by Doctor Name if ID is missing, but be careful of "System"
                const sameName = g.doctor_name === log.doctor_name && log.doctor_name !== 'System';

                if (sameId || sameName) {
                    targetGroup = g;
                    break;
                }
            }

            // Time Check against the found target group
            let shouldMerge = false;

            if (targetGroup) {
                const lastLog = targetGroup.logs[targetGroup.logs.length - 1];
                const lastLogTime = parseDate(lastLog.timestamp).getTime();
                const currentLogTime = parseDate(log.timestamp).getTime();
                const diffMinutes = (currentLogTime - lastLogTime) / (1000 * 60);

                // Allow up to 20 mins for session continuity
                shouldMerge = Math.abs(diffMinutes) <= 20;
            }

            if (targetGroup && shouldMerge) {
                targetGroup.logs.push(log);

                // Upgrade Type if Emergency Mode
                if (targetGroup.type !== 'EMERGENCY' && (log.event_type === 'EMERGENCY_OVERRIDE' || log.access_mode === 'EMERGENCY')) {
                    targetGroup.type = 'EMERGENCY';
                }

                // Upgrade Type if Denied (but Emergency still wins)
                if (targetGroup.type !== 'EMERGENCY' && log.event_type === 'ACCESS_DENIED') {
                    targetGroup.type = 'DENIED';
                }
            } else {
                // Create new group
                let type: GroupType = 'TECHNICAL';
                if (log.event_type === 'EMERGENCY_OVERRIDE' || log.access_mode === 'EMERGENCY') {
                    type = 'EMERGENCY';
                } else if (log.event_type === 'ACCESS_APPROVED' || log.event_type === 'VIEW_REPORTS' || log.event_type === 'VIEW_EMERGENCY_PROFILE') {
                    type = 'NORMAL';
                } else if (log.event_type === 'ACCESS_DENIED') {
                    type = 'DENIED';
                }

                groups.push({
                    id: `group-${log.id}-${Math.random().toString(36).substr(2, 9)}`,
                    type,
                    doctor_name: log.doctor_name,
                    doctor_id: log.doctor_id,
                    anchorTime: log.timestamp,
                    logs: [log],
                    hasOverride: log.event_type === 'EMERGENCY_OVERRIDE',
                    hasProfileView: log.event_type === 'VIEW_EMERGENCY_PROFILE',
                    hasReportView: log.event_type === 'VIEW_REPORTS'
                });
            }
        }

        // 3. Classification & Refinement
        const refinedGroups = groups.map(group => {
            // A. Update Flags
            group.hasOverride = group.logs.some(l => l.event_type === 'EMERGENCY_OVERRIDE');
            group.hasProfileView = group.logs.some(l => l.event_type === 'VIEW_EMERGENCY_PROFILE');
            group.hasReportView = group.logs.some(l => l.event_type === 'VIEW_REPORTS');

            // B. Determine Type & Anchor
            // Priority 1: Emergency
            if (group.type === 'EMERGENCY' || group.hasOverride || (group.hasProfileView && group.logs.some(l => l.access_mode === 'EMERGENCY'))) {
                group.type = 'EMERGENCY';
                // Anchor to the Override event (The start of the incident)
                const overrideEvent = group.logs.find(l => l.event_type === 'EMERGENCY_OVERRIDE');
                if (overrideEvent) {
                    group.anchorTime = overrideEvent.timestamp;
                } else {
                    // Fallback to first emergency view
                    const firstEmergView = group.logs.find(l => l.event_type === 'VIEW_EMERGENCY_PROFILE');
                    if (firstEmergView) group.anchorTime = firstEmergView.timestamp;
                }
            }
            // Priority 2: Normal Access
            else {
                const approvalEvents = group.logs.filter(l => l.event_type === 'ACCESS_APPROVED');
                const anyReasonableView = group.logs.find(l => l.event_type === 'VIEW_REPORTS');

                if (approvalEvents.length > 0 || anyReasonableView) {
                    group.type = 'NORMAL';
                    // Anchor to the EARLIEST Approval
                    if (approvalEvents.length > 0) {
                        group.anchorTime = approvalEvents[0].timestamp;
                    } else if (anyReasonableView) {
                        group.anchorTime = anyReasonableView.timestamp;
                    }
                }
            }

            // C. NARRATIVE SANTIIZER
            if (group.type === 'NORMAL') {
                const approvalIndex = group.logs.findIndex(l => l.event_type === 'ACCESS_APPROVED');
                if (approvalIndex !== -1) {
                    const approvalLog = group.logs[approvalIndex];
                    const nonViews = group.logs.filter(l => l.event_type !== 'VIEW_REPORTS' && l.event_type !== 'ACCESS_APPROVED');
                    const views = group.logs.filter(l => l.event_type === 'VIEW_REPORTS');
                    const otherApprovals = group.logs.filter((l, idx) => l.event_type === 'ACCESS_APPROVED' && idx !== approvalIndex);
                    group.logs = [...nonViews, approvalLog, ...otherApprovals, ...views];
                }
            }

            return group;
        });

        // 4. Final Sort: DESCENDING by Anchor Time
        return refinedGroups.sort((a, b) =>
            parseDate(b.anchorTime).getTime() - parseDate(a.anchorTime).getTime()
        );
    };

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // --- RENDERERS ---

    const renderDataScope = (group: TimelineGroup) => {
        // Shared "Binary Confirmation" Style
        const Item = ({ present, label }: { present: boolean, label: string }) => (
            <div className={`flex items-center gap-2 text-sm ${present ? 'text-gray-800' : 'text-gray-400 opacity-80'}`}>
                {present ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                    <span className="w-4 h-4 flex items-center justify-center font-bold text-gray-300 text-[10px]">✖</span>
                )}
                <span className={present ? 'font-medium' : ''}>{label}</span>
            </div>
        );

        // Context Check for Matrix
        const hasEmergContext = group.logs.some(l => l.access_context === 'EMERGENCY_CONTEXT');
        // Reason Check: Get first available reason
        const reasonCode = group.logs.find(l => l.access_reason)?.access_reason;
        const reasonLabel = reasonCode ? (REASON_LABELS[reasonCode] || reasonCode) : null;

        if (group.type === 'EMERGENCY') {
            return (
                <div className="mt-4 p-4 bg-white/80 rounded-lg border border-red-100/50 space-y-2">
                    {reasonLabel && (
                        <div className="text-xs font-semibold text-red-700 bg-red-50 p-1.5 rounded mb-2 inline-block">
                            Reason: {reasonLabel}
                        </div>
                    )}
                    <Item present={true} label="Emergency profile viewed" />
                    <Item present={group.hasReportView} label={group.hasReportView ? "Medical reports accessed" : "Medical reports NOT accessed"} />
                </div>
            )
        }
        if (group.type === 'NORMAL') {
            return (
                <div className="mt-4 p-4 bg-gray-50/80 rounded-lg border border-gray-100 space-y-2">
                    {reasonLabel && (
                        <div className="text-xs font-semibold text-gray-700 bg-gray-200/50 p-1.5 rounded mb-2 inline-block border border-gray-200">
                            Reason: {reasonLabel}
                        </div>
                    )}
                    {hasEmergContext ? (
                        <Item present={true} label="Emergency medical information viewed" />
                    ) : (
                        <Item present={group.hasReportView} label={group.hasReportView ? "Medical records viewed" : "Medical records NOT accessed"} />
                    )}
                </div>
            )
        }
        return null;
    };

    const renderTechnicalGroup = (group: TimelineGroup) => {
        // Only show pure technical groups (like just a QR scan) if enabled
        if (!showTechnical) return null;

        return (
            <div key={group.id} className="relative pl-14 opacity-60 hover:opacity-100 transition-opacity">
                <div className="absolute left-3 top-1 -ml-1.5 w-8 h-8 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center z-10">
                    <QrCode className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="py-2 pr-4 text-xs text-gray-400 flex justify-between items-center border-b border-gray-50 border-dashed">
                    <div className="flex gap-2">
                        <span className="font-mono">{formatTime(group.anchorTime)}</span>
                        <span>{group.logs.length} system events ({group.doctor_name})</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-24">
            {/* Page Framing */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Who accessed your health data</h1>
                        <p className="text-sm text-gray-500 mt-1">A clear record of every time your data was viewed.</p>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors self-start sm:self-center">
                        <input
                            type="checkbox"
                            checked={showTechnical}
                            onChange={e => setShowTechnical(e.target.checked)}
                            className="rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                        />
                        Show administrative details
                    </label>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Loading timeline...</div>
            ) : timeline.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">No activity recorded yet.</div>
            ) : (
                <div className="relative space-y-6">
                    {/* Timeline Connector Line */}
                    <div className="absolute left-6 top-4 bottom-4 w-px bg-gray-200 -z-10"></div>

                    {timeline.map((group) => {
                        const isExpanded = expandedGroups[group.id];
                        const dateLabel = formatDate(group.anchorTime);
                        const timeLabel = formatTime(group.anchorTime);
                        const relativeTime = getRelativeTime(group.anchorTime);

                        // --- TECHNICAL ---
                        if (group.type === 'TECHNICAL') return renderTechnicalGroup(group);

                        // --- EMERGENCY ---
                        if (group.type === 'EMERGENCY') {
                            return (
                                <div key={group.id} className="relative pl-14">
                                    {/* Icon */}
                                    <div className="absolute left-3 top-0 -ml-1.5 w-8 h-8 rounded-full bg-red-100 border-2 border-white shadow-sm flex items-center justify-center text-lg z-10">
                                        🚨
                                    </div>

                                    {/* Card */}
                                    <div className="bg-red-50 border border-red-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div
                                            className="p-5 cursor-pointer"
                                            onClick={() => toggleGroup(group.id)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-red-900">Emergency access was used</h3>
                                                    </div>
                                                    <p className="text-sm text-red-700/80 mt-1">
                                                        A doctor accessed your emergency details when you could not respond.
                                                    </p>

                                                    {/* Always Visible Trust Reassurance */}
                                                    <p className="text-xs text-red-600/70 italic mt-2">
                                                        Emergency access is allowed only for life-saving situations and is always recorded.
                                                    </p>
                                                </div>
                                                <button className="text-red-400 hover:text-red-600 p-1">
                                                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                </button>
                                            </div>

                                            {/* Safety Status + Who + What */}
                                            <div className="mt-4 pt-4 border-t border-red-100/50">
                                                <div className="flex justify-between items-center text-xs text-red-400 font-medium uppercase tracking-wider mb-2">
                                                    <span>Safety Recorded • {relativeTime}</span>
                                                </div>
                                                <p className="text-sm text-gray-800">
                                                    <span className="font-semibold">{group.doctor_name}</span> has accessed your emergency profile.
                                                </p>
                                                {!isExpanded && renderDataScope(group)}
                                            </div>
                                        </div>

                                        {/* EXPANDED DETAILS */}
                                        {isExpanded && (
                                            <div className="bg-white/50 border-t border-red-100 p-5 pt-0">
                                                {renderDataScope(group)}

                                                <div className="mt-5 space-y-3">
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-red-100 pb-1 mb-2">Technical Evidence</h4>

                                                    {/* Unified Event Line */}
                                                    <div className="flex gap-3 text-sm">
                                                        <span className="font-mono text-gray-400 text-xs py-0.5">{dateLabel}, {timeLabel}</span>
                                                        <div className="space-y-0.5">
                                                            <p className="text-gray-900 font-medium">Emergency access recorded</p>
                                                        </div>
                                                    </div>

                                                    {/* Administrative / Technical Details (Only if toggle is ON) */}
                                                    {showTechnical && group.logs.map((log, i) => {
                                                        const isTechnical = ['QR_VALIDATED', 'ACCESS_REQUESTED'].includes(log.event_type);
                                                        if (!isTechnical) return null;
                                                        return (
                                                            <div key={i} className="flex gap-3 text-sm opacity-70">
                                                                <span className="font-mono text-gray-400 text-xs py-0.5 w-16">{formatTime(log.timestamp)}</span>
                                                                <div className="space-y-0.5">
                                                                    <p className="text-gray-500 italic">{EVENT_DESCRIPTIONS[log.event_type] || log.event_type}</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // --- DENIED ---
                        if (group.type === 'DENIED') {
                            return (
                                <div key={group.id} className="relative pl-14">
                                    {/* Icon */}
                                    <div className="absolute left-3 top-0 -ml-1.5 w-8 h-8 rounded-full bg-red-100 border-2 border-white shadow-sm flex items-center justify-center z-10">
                                        <AlertTriangle className="w-4 h-4 text-red-600" />
                                    </div>

                                    {/* Card */}
                                    <div className="bg-white border border-red-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div className="p-5">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-lg">Access Denied</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                                            Blocked
                                                        </span>
                                                        <span className="text-xs text-gray-400">• {relativeTime}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4 text-sm text-gray-600">
                                                <p>You denied access to <span className="font-semibold text-gray-900">{group.doctor_name}</span>.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // --- NORMAL ---
                        if (group.type === 'NORMAL') {
                            const hasEmergContext = group.logs.some(l => l.access_context === 'EMERGENCY_CONTEXT');
                            const hasApproval = group.logs.some(l => l.event_type === 'ACCESS_APPROVED');

                            // Matrix String Selection
                            let title = "";
                            let body = "";

                            if (hasEmergContext) {
                                title = "Emergency Info Accessed";
                                body = `${group.doctor_name} accessed your emergency medical information.`;
                            } else {
                                title = hasApproval ? "Access approved by you" : "Medical records viewed";
                                body = hasApproval
                                    ? `You allowed ${group.doctor_name} to view your records.`
                                    : `${group.doctor_name} accessed your records.`;
                            }

                            return (
                                <div key={group.id} className="relative pl-14">
                                    {/* Icon */}
                                    <div className="absolute left-3 top-0 -ml-1.5 w-8 h-8 rounded-full bg-green-100 border-2 border-white shadow-sm flex items-center justify-center z-10">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                    </div>

                                    {/* Card */}
                                    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div
                                            className="p-5 cursor-pointer"
                                            onClick={() => toggleGroup(group.id)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${hasEmergContext ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                                            {hasEmergContext ? 'Emergency Info' : 'Authorized'}
                                                        </span>
                                                        <span className="text-xs text-gray-400">• {relativeTime}</span>
                                                    </div>
                                                </div>
                                                <button className="text-gray-400 hover:text-gray-600 p-1">
                                                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                </button>
                                            </div>

                                            <div className="mt-4 text-sm text-gray-600">
                                                <p dangerouslySetInnerHTML={{ __html: body.replace(group.doctor_name, `<span class="font-semibold text-gray-900">${group.doctor_name}</span>`) }} />
                                                {!isExpanded && renderDataScope(group)}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="bg-gray-50 border-t border-gray-100 p-5 pt-0">
                                                {renderDataScope(group)}

                                                <div className="mt-5 space-y-3">
                                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1 mb-2">Detailed Log</h4>
                                                    {group.logs.map((log, i) => (
                                                        <div key={i} className="flex gap-3 text-sm">
                                                            <span className="font-mono text-gray-400 text-xs py-0.5 w-24">{dateLabel}, {formatTime(log.timestamp)}</span>
                                                            <div className="flex flex-col">
                                                                <span className="text-gray-700 font-medium">{EVENT_DESCRIPTIONS[log.event_type] || log.event_type}</span>
                                                                {log.report_id && <span className="text-xs text-blue-500">Document ID: {log.report_id}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            )}

            {/* Trust Footer */}
            <div className="flex flex-col items-center justify-center text-center mt-12 py-8 border-t border-gray-100">
                <Shield className="w-8 h-8 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">You are always in control.</p>
                <p className="text-xs text-gray-500 max-w-sm mt-1">No access happens without your approval or a logged emergency situation.</p>
            </div>
        </div>
    );
}
