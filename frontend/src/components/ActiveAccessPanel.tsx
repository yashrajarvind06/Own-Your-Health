import { useEffect, useState } from "react";
import { api } from "../api";

interface ActiveSession {
    doctor_id: number;
    doctor_name: string;
    access_mode: "NORMAL" | "EMERGENCY";
    expires_at: string;
    remaining_seconds: number;
    revocable: boolean;
}

export function ActiveAccessPanel() {
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSessions = async () => {
        try {
            const data = await api("/access/patient/active");
            if (Array.isArray(data)) {
                setSessions(data);
            }
        } catch (error) {
            console.error("Failed to fetch active sessions", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 5000); // Auto-refresh every 5s
        return () => clearInterval(interval);
    }, []);

    const handleRevoke = async (doctorId: number) => {
        if (!window.confirm("Are you sure you want to revoke access? The doctor will be disconnected immediately.")) return;
        try {
            await api("/access/revoke", {
                method: "POST",
                body: JSON.stringify({ doctor_id: doctorId, reason: "Patient Revoked Access" })
            });
            fetchSessions();
        } catch (error: any) {
            alert("Failed to revoke: " + error.message);
        }
    };

    // Helper to format remaining time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    if (loading && sessions.length === 0) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl"></div>;

    if (sessions.length === 0) return null; // Hide if empty

    return (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100 overflow-hidden">
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                <h3 className="font-bold text-blue-900 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    Active Doctor Access
                </h3>
            </div>
            <div className="divide-y divide-gray-100">
                {sessions.map((session) => (
                    <div key={session.doctor_id} className={`p-4 ${session.access_mode === 'EMERGENCY' ? 'bg-red-50/50' : 'bg-white'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="font-bold text-gray-900">{session.doctor_name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {session.access_mode === 'EMERGENCY' ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                            🚨 EMERGENCY
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                            Normal Access
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-mono font-bold text-gray-700">
                                    {formatTime(session.remaining_seconds)}
                                </p>
                                <p className="text-xs text-gray-500">remaining</p>
                            </div>
                        </div>

                        {session.revocable ? (
                            <button
                                onClick={() => handleRevoke(session.doctor_id)}
                                className="w-full mt-2 py-1.5 px-3 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                            >
                                Revoke Access Now
                            </button>
                        ) : (
                            <div className="mt-2 text-center py-1.5 px-3 bg-red-100 text-red-700 rounded-lg text-xs font-medium border border-red-200 flex items-center justify-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                Emergency Access Cannot Be Revoked
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
