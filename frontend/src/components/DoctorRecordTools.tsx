import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "./ui/Button";
import { MessageSquare, CheckCircle2, X } from "lucide-react";

// Keys match trust_badge in backend/app/services/records.py (docx trust badges)
const BADGES: Record<string, { label: string; cls: string }> = {
    UNVERIFIED: { label: "🟡 Patient-uploaded (Unverified)", cls: "text-yellow-700" },
    DOCTOR_VERIFIED: { label: "🟢 Doctor-uploaded (Verified)", cls: "text-green-700" },
    LAB_VERIFIED: { label: "🔵 Lab-uploaded (Verified Lab)", cls: "text-blue-700" },
    DOCTOR_REVIEWED: { label: "⭐ Doctor-reviewed", cls: "text-purple-700" },
};

export function TrustBadge({ badge }: { badge?: string }) {
    const b = BADGES[badge || "UNVERIFIED"] ?? BADGES.UNVERIFIED;
    return <span className={`text-xs ${b.cls}`}>{b.label}</span>;
}

type Summary = {
    name: string | null; age: number | null; gender: string | null; blood_group: string | null; abha_number: string | null;
    chronic_conditions: string[]; current_medications: string[]; allergies: string[];
    recent_tests: { id: number; date: string; summary: string }[]; latest_vitals: string[];
    last_visit: { days_ago: number; type: string } | null; total_records: number; verified_record_count: number; overview: string;
};

/** docx "Patient Snapshot" for the doctor: what matters now, at a glance. */
export function PatientSummaryPanel({ patientId }: { patientId: number }) {
    const [s, setS] = useState<Summary | null>(null);
    useEffect(() => { api(`/reports/patient-summary/${patientId}`).then(setS).catch(() => setS(null)); }, [patientId]);
    if (!s) return null;
    const row = (label: string, value?: string | null, cls = "") =>
        value ? <div className="flex gap-2"><span className="w-36 shrink-0 text-gray-500">{label}</span><span className={cls}>{value}</span></div> : null;
    return (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900">Patient snapshot {s.abha_number && <span className="ml-2 text-xs font-normal text-green-700">ABHA {s.abha_number} ✓</span>}</div>
            <p className="text-gray-700 pb-1">{s.overview}</p>
            {row("Age / Gender", [s.age, s.gender].filter(Boolean).join(" / "))}
            {row("Blood group", s.blood_group)}
            {row("Chronic conditions", s.chronic_conditions.join(", "))}
            {row("Current medications", s.current_medications.join(", "))}
            {row("Allergies", s.allergies.join(", "), "font-semibold text-red-600")}
            {row("Latest values", s.latest_vitals.join(", "))}
            {row("Last visit", s.last_visit ? `${s.last_visit.days_ago} days ago (${s.last_visit.type})` : null)}
            {s.recent_tests.length > 0 && row("Recent tests", s.recent_tests.map(t => `${t.date}: ${t.summary}`).join(" · "))}
            <div className="text-xs text-gray-500 pt-1">{s.total_records} records · {s.verified_record_count} verified</div>
        </div>
    );
}

type Comment = { id: number; body: string; doctor_name: string | null; created_at: string };

/** Doctor-only notes on a report plus "mark as reviewed" (docx: comment section / mark as reviewed). */
export function ReportNotes({ reportId, reviewed, onReviewed }: { reportId: number; reviewed: boolean; onReviewed: () => void }) {
    const [open, setOpen] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) api(`/reports/${reportId}/comments`).then(setComments).catch((e) => setError(e.message));
    }, [open, reportId]);

    const add = async () => {
        try {
            const c = await api(`/reports/${reportId}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
            setComments([...comments, c]);
            setText("");
        } catch (e: any) { setError(e.message); }
    };

    const review = async () => {
        try { await api(`/reports/${reportId}/review`, { method: "POST" }); onReviewed(); } catch (e: any) { setError(e.message); }
    };

    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpen(!open)}><MessageSquare size={14} className="mr-1 inline" />Notes</Button>
                {!reviewed && <Button size="sm" variant="outline" onClick={review}><CheckCircle2 size={14} className="mr-1 inline" />Mark reviewed</Button>}
            </div>
            {open && (
                <div className="rounded border border-gray-200 bg-white p-3 space-y-2 text-sm">
                    <div className="text-xs text-gray-500">Visible to doctors only, not the patient.</div>
                    {comments.map(c => (
                        <div key={c.id} className="border-l-2 border-blue-200 pl-2">
                            <div>{c.body}</div>
                            <div className="text-xs text-gray-500">{c.doctor_name ?? "Doctor"} · {new Date(c.created_at + "Z").toLocaleString()}</div>
                        </div>
                    ))}
                    <textarea className="w-full rounded border border-gray-300 p-2" rows={2} value={text} maxLength={2000}
                        placeholder="Add a note for other doctors…" onChange={(e) => setText(e.target.value)} />
                    <Button size="sm" onClick={add} disabled={!text.trim()}>Add note</Button>
                </div>
            )}
            {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
    );
}

export type CompareItem = {
    id: number; filename: string; record_type?: string; record_date?: string; one_line_summary?: string | null;
    vitals?: Record<string, number | string | null> | null; mime_type?: string;
};

const VITAL_LABELS: Record<string, string> = {
    bp_systolic: "BP systolic", bp_diastolic: "BP diastolic", glucose: "Blood sugar", heart_rate: "Heart rate", weight: "Weight", temperature: "Temperature",
};

/** docx: side-by-side report comparison. */
export function CompareModal({ items, onClose }: { items: CompareItem[]; onClose: () => void }) {
    const [urls, setUrls] = useState<Record<number, string>>({});
    useEffect(() => {
        api("/reports/access", { method: "POST", body: JSON.stringify({ report_ids: items.map(i => i.id) }) })
            .then((res: { id: number; url: string }[]) => setUrls(Object.fromEntries(res.map(r => [r.id, r.url]))))
            .catch(() => {});
    }, [items]);

    const keys = Object.keys(VITAL_LABELS).filter(k => items.some(i => i.vitals?.[k] != null));
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b p-4">
                    <h3 className="text-lg font-bold">Compare reports</h3>
                    <button onClick={onClose} aria-label="Close"><X /></button>
                </div>
                <div className="overflow-auto p-4 space-y-4">
                    {keys.length > 0 && (
                        <table className="w-full text-sm">
                            <thead><tr><th className="text-left text-gray-500">Value</th>{items.map(i => <th key={i.id} className="text-left">{i.record_date?.slice(0, 10)}</th>)}</tr></thead>
                            <tbody>{keys.map(k => (
                                <tr key={k} className="border-t"><td className="py-1 text-gray-500">{VITAL_LABELS[k]}</td>{items.map(i => <td key={i.id}>{i.vitals?.[k] ?? "—"}</td>)}</tr>
                            ))}</tbody>
                        </table>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                        {items.map(i => (
                            <div key={i.id} className="space-y-2">
                                <div className="font-medium">{i.record_type} · {i.record_date?.slice(0, 10)}</div>
                                <div className="text-sm text-gray-600">{i.one_line_summary}</div>
                                {urls[i.id] ? (
                                    i.mime_type === "application/pdf"
                                        ? <iframe title={i.filename} src={urls[i.id]} className="h-[60vh] w-full rounded border" />
                                        : <img alt={i.filename} src={urls[i.id]} className="max-h-[60vh] w-full rounded border object-contain" />
                                ) : <div className="text-sm text-gray-400">Loading…</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
