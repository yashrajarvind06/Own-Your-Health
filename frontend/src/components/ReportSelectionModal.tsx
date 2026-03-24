import { useState, useEffect } from "react";
import { api } from "../api";
import { Button } from "./ui/Button";

interface Report {
    id: number;
    filename: string;
    created_at: string;
}

interface ReportSelectionModalProps {
    onConfirm: (reportIds: number[]) => void;
    onCancel: () => void;
    patientId: number;
}

export function ReportSelectionModal({ onConfirm, onCancel, patientId }: ReportSelectionModalProps) {
    const [reports, setReports] = useState<Report[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch patient's own reports
        // Since this component is used by PatientDashboard, we use /reports/my
        // But /reports/my uses "current user".
        // If we are in PatientDashboard context, yes.
        api("/reports/my").then((data) => {
            if (Array.isArray(data)) setReports(data);
            setLoading(false);
        }).catch(console.error);
    }, []);

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const toggleAll = () => {
        if (selected.size === reports.length) setSelected(new Set());
        else setSelected(new Set(reports.map(r => r.id)));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">Select Reports to Share</h3>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="text-center text-gray-500">Loading reports...</div>
                    ) : reports.length === 0 ? (
                        <div className="text-center text-gray-500">No reports uploaded yet.</div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex justify-end">
                                <button onClick={toggleAll} className="text-xs text-blue-600 font-semibold hover:underline">
                                    {selected.size === reports.length ? "Deselect All" : "Select All"}
                                </button>
                            </div>
                            {reports.map(r => (
                                <div
                                    key={r.id}
                                    onClick={() => toggle(r.id)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                        ${selected.has(r.id) ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200 hover:border-blue-300'}
                                    `}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center
                                        ${selected.has(r.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}
                                    `}>
                                        {selected.has(r.id) && <span className="text-white text-xs">✓</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 truncate">{r.filename}</div>
                                        <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button onClick={() => onConfirm(Array.from(selected))}>
                        Confirm Access ({selected.size})
                    </Button>
                </div>
            </div>
        </div>
    );
}
