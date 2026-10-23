import { useEffect, useState } from "react";
import { api, apiForm } from "../api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

type Me = { display_name: string | null; verified: boolean; hpr_id: string | null; registry_profile: { name: string; city: string; facility_type: string } | null };

/** Verified labs (HFR) upload official lab reports; they show as "Lab-uploaded (Verified Lab)". */
export default function LabDashboard() {
    const [me, setMe] = useState<Me | null>(null);
    const [patient, setPatient] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [summary, setSummary] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => { api("/user/me/profile").then(setMe).catch(() => {}); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setMessage(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            // 14 digits (with or without dashes) is an ABHA number, anything shorter is a patient ID
            if (patient.replace(/\D/g, "").length === 14) fd.append("abha_number", patient);
            else fd.append("patient_id", patient.trim());
            fd.append("record_type", "Lab Report");
            fd.append("record_date", date);
            if (summary.trim()) fd.append("summary", summary.trim());
            const res = await apiForm("/reports/upload-by-lab", fd);
            setMessage({ ok: true, text: `Uploaded: ${res.one_line_summary}` });
            setFile(null);
            setSummary("");
        } catch (err: any) {
            setMessage({ ok: false, text: err.message || "Upload failed" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-8">
            <Card title="Laboratory">
                {me && (
                    <div className="text-sm">
                        <div className="font-semibold">{me.registry_profile?.name ?? me.display_name}</div>
                        <div className={me.verified ? "text-green-700" : "text-red-600"}>
                            {me.verified ? `✓ Verified facility (${me.hpr_id}) · ${me.registry_profile?.city ?? ""}` : "Not verified: link your HFR ID from your profile"}
                        </div>
                    </div>
                )}
            </Card>
            <Card title="Upload lab report">
                <form onSubmit={submit} className="space-y-4">
                    <Input label="Patient ABHA number or patient ID" value={patient} onChange={e => setPatient(e.target.value)} required placeholder="91-1234-5678-9012" />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Report file (PDF or image)</label>
                        <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} required />
                    </div>
                    <Input label="Report date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                    <Input label="One-line summary (optional)" value={summary} maxLength={280} onChange={e => setSummary(e.target.value)} placeholder="e.g. HbA1c 7.2%, lipid profile normal" />
                    {message && <div className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{message.text}</div>}
                    <Button className="w-full" isLoading={busy} disabled={!me?.verified || !file}>Upload as verified lab report</Button>
                </form>
            </Card>
        </div>
    );
}
