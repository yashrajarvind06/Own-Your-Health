import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";

type Trust = { score: number; breakdown: Record<string, number>; rating_avg: number | null; rating_count: number; endorsements: number };

const LABELS: Record<string, [string, number]> = {
    registry: ["HPR registry verified", 40],
    affiliation: ["Hospital affiliation", 20],
    feedback: ["Patient feedback", 30],
    community: ["Colleague endorsements", 10],
};

/** docx trust score: the doctor's own breakdown, plus community verification of colleagues by HPR ID. */
export default function TrustPanel() {
    const [trust, setTrust] = useState<Trust | null>(null);
    const [hpr, setHpr] = useState("");
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => { api("/doctor/me/trust").then(setTrust).catch(() => {}); }, []);

    const endorse = async () => {
        try {
            const res = await api("/doctors/endorse", { method: "POST", body: JSON.stringify({ hpr_id: hpr }) });
            setMessage({ ok: true, text: `Endorsed ${res.endorsed}. Their trust score is now ${res.trust.score}/100.` });
            setHpr("");
        } catch (e: any) {
            setMessage({ ok: false, text: e.message || "Could not endorse" });
        }
    };

    if (!trust) return null;
    return (
        <Card title={`Trust score: ${trust.score}/100`} description="What patients see before approving your requests.">
            <div className="space-y-2 text-sm">
                {Object.entries(LABELS).map(([key, [label, max]]) => (
                    <div key={key}>
                        <div className="flex justify-between"><span className="text-gray-600">{label}</span><span>{trust.breakdown[key]}/{max}</span></div>
                        <div className="h-1.5 rounded bg-gray-100"><div className="h-1.5 rounded bg-blue-600" style={{ width: `${(trust.breakdown[key] / max) * 100}%` }} /></div>
                    </div>
                ))}
                <div className="text-xs text-gray-500">
                    {trust.rating_count ? `★${trust.rating_avg} from ${trust.rating_count} patient${trust.rating_count > 1 ? "s" : ""}` : "No patient ratings yet"} · {trust.endorsements} endorsement{trust.endorsements === 1 ? "" : "s"}
                </div>
                <div className="border-t pt-3">
                    <div className="mb-1 font-medium text-gray-700">Endorse a colleague</div>
                    <div className="flex gap-2">
                        <Input value={hpr} onChange={(e) => setHpr(e.target.value)} placeholder="Colleague's HPR ID" aria-label="Colleague's HPR ID" />
                        <Button onClick={endorse} disabled={!hpr.trim()}>Endorse</Button>
                    </div>
                    {message && <div className={`mt-2 text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</div>}
                </div>
            </div>
        </Card>
    );
}
