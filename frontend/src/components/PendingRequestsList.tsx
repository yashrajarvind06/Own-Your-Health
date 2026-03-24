import { useState, useEffect } from "react";
import { api } from "../api";
import { Button } from "./ui/Button";

export default function PendingRequestsList({ onActionComplete }: { onActionComplete?: () => void }) {
    const [requests, setRequests] = useState<any[]>([]);

    useEffect(() => {
        load();
        // Poll every 5s for new requests
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, []);

    const load = async () => {
        try {
            const res = await api("/access/reports/patient/pending");
            if (Array.isArray(res)) {
                setRequests(res);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleRespond = async (id: number, decision: "APPROVED" | "DENIED") => {
        try {
            // FIX: Correct API signature
            await api("/access/reports/patient/respond", {
                method: "POST",
                body: JSON.stringify({
                    request_id: id,
                    decision
                })
            });
            await load(); // Refresh immediately

            // Trigger parent refresh nicely
            if (onActionComplete) {
                setTimeout(() => {
                    onActionComplete();
                }, 300); // 300ms delay to allow local animation
            }

        } catch (e: any) {
            alert(e.message || "Action failed");
        }
    };

    if (requests.length === 0) return null;

    return (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <h3 className="text-orange-800 font-bold flex items-center gap-2 mb-3">
                <span className="flex h-2 w-2 rounded-full bg-orange-600 animate-pulse"></span>
                Action Required: Pending Requests
            </h3>

            <div className="space-y-3">
                {requests.map(req => (
                    <div key={req.id} className="bg-white p-3 rounded-lg border border-orange-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all duration-300 hover:shadow-md">
                        <div>
                            <div className="font-semibold text-gray-900">{req.doctor_name} wants to access <span className="text-blue-600">{req.report_name}</span></div>
                            <div className="text-sm text-gray-500">Reason: {req.reason}</div>
                            <div className="text-xs text-gray-400 mt-1">{new Date(req.created_at).toLocaleTimeString()}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 transition-colors" onClick={() => handleRespond(req.id, "DENIED")}>
                                Deny
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={() => handleRespond(req.id, "APPROVED")}>
                                Approve (10m)
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
