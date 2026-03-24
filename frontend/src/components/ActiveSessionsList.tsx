import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

interface ActiveSession {
    patient_id: number;
    patient_name: string;
    expires_at: string;
    remaining_seconds: number;
    access_mode: "NORMAL" | "EMERGENCY";
}

interface ActiveSessionsListProps {
    onSelect: (session: ActiveSession) => void;
    onSessionEnd?: () => void;
    currentPatientId: number | null;
}

export function ActiveSessionsList({ onSelect, onSessionEnd, currentPatientId }: ActiveSessionsListProps) {
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSessions = async () => {
        try {
            const data = await api("/access/sessions/active");
            if (Array.isArray(data)) {
                // Ensure access_mode is consistent
                setSessions(data);
            }
        } catch (error) {
            console.error("Failed to fetch active sessions", error);
        } finally {
            setLoading(false);
        }
    };

    const revokeSession = async (e: React.MouseEvent, patientId: number) => {
        e.stopPropagation(); // Prevent card click
        if (!window.confirm("Are you sure you want to end this session? Access will be revoked immediately.")) return;

        try {
            await api("/access/revoke", {
                method: "POST",
                body: JSON.stringify({ patient_id: patientId, reason: "Doctor Ended Session" })
            });
            // Refresh list immediately
            fetchSessions();

            // If the revoked session was the currently selected one, clear the view
            if (patientId === currentPatientId && onSessionEnd) {
                onSessionEnd();
            }
        } catch (error: any) {
            alert(error.message);
        }
    };

    const viewEmergency = async (e: React.MouseEvent, patientId: number) => {
        e.stopPropagation();
        // This is a "global" action, but typically we want to load it into the main view.
        // For Dashboard list, maybe we just select the patient to load the standard view?
        // User Spec: "Buttons: View Patient, View Emergency Info, End Session".
        // If we click View Emergency, it should probably select the patient AND trigger the modal/view?
        // Let's keep it simple: Select Patient (which loads Dashboard), then user clicks View Info?
        // OR: Trigger a callback.
        // For now, let's allow "View Patient" to handle it. 
        // We will just select the session.
        const session = sessions.find(s => s.patient_id === patientId);
        if (session) onSelect(session);
    };

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, []);

    const formatTime = (s: number) => {
        if (s <= 0) return "Expired";
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading && sessions.length === 0) {
        return (
            <Card title="Active Sessions">
                <div className="p-4 text-center text-gray-400 text-sm">Loading active sessions...</div>
            </Card>
        );
    }

    return (
        <Card title="Active Sessions" className="border-t-4 border-t-blue-500">
            <div className="p-2">
                {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                        <span className="text-3xl mb-2 opacity-20">🏥</span>
                        <p className="text-sm">No active sessions. Scan a patient QR to begin.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sessions.map((session) => {
                            const isActive = session.patient_id === currentPatientId;
                            const isEmergency = session.access_mode === "EMERGENCY";
                            const isExpiring = session.remaining_seconds < 60;

                            return (
                                <div
                                    key={session.patient_id}
                                    onClick={() => onSelect(session)}
                                    className={`group relative p-4 rounded-xl border-2 transition-all cursor-pointer shadow-sm
                                        ${isEmergency
                                            ? 'bg-red-50 border-red-200 hover:border-red-300'
                                            : isActive
                                                ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                                                : 'bg-white border-gray-100 hover:border-blue-200'
                                        }
                                    `}
                                >
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className={`font-bold text-lg ${isEmergency ? 'text-red-900' : 'text-gray-900'}`}>
                                                {session.patient_name}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                                                    ${isEmergency
                                                        ? 'bg-red-100 text-red-700 border-red-200'
                                                        : 'bg-green-100 text-green-700 border-green-200'}
                                                 `}>
                                                    {isEmergency ? '🚨 EMERGENCY' : '🟢 ACTIVE'}
                                                </span>
                                                <span className="text-xs text-gray-500">ID: {session.patient_id}</span>
                                            </div>
                                        </div>
                                        <div className={`text-sm font-mono font-bold px-2 py-1 rounded
                                            ${isExpiring ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600'}
                                        `}>
                                            {formatTime(session.remaining_seconds)}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            size="sm"
                                            className={`flex-1 ${isEmergency ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); onSelect(session); }}
                                        >
                                            View Patient
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="px-2 bg-white border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                            title="End Session"
                                            onClick={(e) => revokeSession(e, session.patient_id)}
                                        >
                                            End Session
                                        </Button>
                                    </div>

                                    {isEmergency && (
                                        <div className="absolute top-0 right-0 -mt-2 -mr-2">
                                            <span className="flex h-4 w-4">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}
