import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Download, ExternalLink, HeartPulse, QrCode, ShieldCheck, UserRound } from "lucide-react";

import { api } from "../../api";
import { markEmergencyQrGenerated, notifyEmergencyProfileStatusChanged } from "./emergencyProfileStatus";
import { Button } from "../ui/Button";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

type Gender = "male" | "female" | "other" | "";
type DonorStatus = "yes" | "no" | "";

interface EmergencyCardForm {
  name: string;
  phone: string;
  emergency_contact: string;
  date_of_birth: string;
  age: string;
  gender: Gender;
  blood_group: string;
  chronic_conditions: string;
  medications: string;
  surgeries: string;
  allergies: string;
  organ_donor_status: DonorStatus;
  organ_donor_details: string;
  pregnancy_status: string;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const EMPTY_FORM: EmergencyCardForm = {
  name: "",
  phone: "",
  emergency_contact: "",
  date_of_birth: "",
  age: "",
  gender: "",
  blood_group: "",
  chronic_conditions: "",
  medications: "",
  surgeries: "",
  allergies: "",
  organ_donor_status: "",
  organ_donor_details: "",
  pregnancy_status: "",
};

function calculateAge(dateOfBirth: string) {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : "";
}

function FieldLabel({ children }: { children: string }) {
  return <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{children}</label>;
}

export default function EmergencyQRSection() {
  const [formData, setFormData] = useState<EmergencyCardForm>(EMPTY_FORM);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrNonce, setQrNonce] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;

    api("/api/emergency-qr/me")
      .then((data: any) => {
        if (cancelled || !data.exists) return;
        setFormData({
          name: data.name || "",
          phone: data.phone || "",
          emergency_contact: data.emergency_contact || "",
          date_of_birth: data.date_of_birth || "",
          age: data.age != null ? String(data.age) : "",
          gender: (data.gender || "") as Gender,
          blood_group: data.blood_group || "",
          chronic_conditions: data.chronic_conditions || "",
          medications: data.medications || "",
          surgeries: data.surgeries || "",
          allergies: data.allergies || "",
          organ_donor_status: (data.organ_donor_status || "") as DonorStatus,
          organ_donor_details: data.organ_donor_details || "",
          pregnancy_status: data.pregnancy_status || "",
        });
        setPatientId(data.patient_id || null);
        setSaved(true);
      })
      .catch(() => {
        /* empty state is fine */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFormData((prev) => {
      const computedAge = calculateAge(prev.date_of_birth);
      if (prev.age === computedAge) return prev;
      return { ...prev, age: computedAge };
    });
  }, [formData.date_of_birth]);

  useEffect(() => {
    if (formData.gender !== "female" && formData.pregnancy_status) {
      setFormData((prev) => ({ ...prev, pregnancy_status: "" }));
    }
  }, [formData.gender, formData.pregnancy_status]);

  useEffect(() => {
    if (formData.organ_donor_status !== "yes" && formData.organ_donor_details) {
      setFormData((prev) => ({ ...prev, organ_donor_details: "" }));
    }
  }, [formData.organ_donor_status, formData.organ_donor_details]);

  const ecardUrl = useMemo(
    () => (patientId ? `${API_BASE}/api/emergency-qr/card/${patientId}` : ""),
    [patientId]
  );
  const qrUrl = useMemo(
    () => (patientId ? `${API_BASE}/api/emergency-qr/qr/${patientId}?v=${qrNonce}` : ""),
    [patientId, qrNonce]
  );

  const updateField = <K extends keyof EmergencyCardForm>(field: K, value: EmergencyCardForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...formData,
        age: formData.age ? Number(formData.age) : null,
        pregnancy_status: formData.gender === "female" ? formData.pregnancy_status : "",
        organ_donor_details: formData.organ_donor_status === "yes" ? formData.organ_donor_details : "",
      };

      const result = await api("/api/emergency-qr/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setPatientId(result.patient_id);
      setSaved(true);
      setQrNonce(Date.now());
      notifyEmergencyProfileStatusChanged();
      setSuccess("Emergency card saved. You can preview the e-card and generate the global QR now.");
    } catch (err: any) {
      setError("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateQr = () => {
    if (!saved || !patientId) return;
    setQrNonce(Date.now());
    setShowQr(true);
    markEmergencyQrGenerated(patientId);
    setSuccess("Global QR generated from your saved emergency card.");
  };

  const handleDownloadQr = async () => {
    if (!patientId) return;
    const response = await fetch(`${API_BASE}/api/emergency-qr/qr/${patientId}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ownyourhealth-emergency-qr.png";
    anchor.click();
    URL.revokeObjectURL(url);
    markEmergencyQrGenerated(patientId);
  };

  if (loading) {
    return <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-center text-stone-500 shadow-sm">Loading emergency card builder...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_55%,#fff1f2_100%)] shadow-[0_24px_70px_rgba(120,53,15,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-orange-100 p-7 lg:border-b-0 lg:border-r">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-orange-700">
              <HeartPulse size={14} />
              One-time emergency card builder
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-black tracking-[-0.04em] text-stone-900">Save once. Preview e-card. Generate a global emergency QR.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
              Fill the details one time and they will power the patient emergency card, the public QR destination, and emergency-visible profile data.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-orange-100 bg-white/80 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Step 1</div>
                <div className="mt-2 text-sm font-semibold text-stone-800">Complete the form</div>
                <div className="mt-1 text-xs leading-6 text-stone-500">Name, DOB, age, gender, medications, donor status, and pregnancy status for female patients.</div>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white/80 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Step 2</div>
                <div className="mt-2 text-sm font-semibold text-stone-800">Generate e-card</div>
                <div className="mt-1 text-xs leading-6 text-stone-500">Saving the form creates the live emergency card URL and keeps it updated.</div>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white/80 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Step 3</div>
                <div className="mt-2 text-sm font-semibold text-stone-800">Generate QR</div>
                <div className="mt-1 text-xs leading-6 text-stone-500">The QR is global and always opens the latest saved e-card for emergency access.</div>
              </div>
            </div>
          </div>

          <div className="p-7">
            <div className="rounded-[28px] border border-stone-900/5 bg-[linear-gradient(180deg,#7f1d1d_0%,#b91c1c_48%,#ea580c_100%)] p-6 text-white shadow-[0_18px_45px_rgba(127,29,29,0.28)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                <ShieldCheck size={13} />
                Live e-card preview
              </div>
              <div className="mt-5 text-3xl font-black tracking-[-0.04em]">{formData.name || "Your name"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">Phone: {formData.phone || "Not set"}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">Blood Group: {formData.blood_group || "N/A"}</span>
              </div>
              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-orange-100">Identity</div>
                  <div className="mt-2 text-sm leading-7 text-orange-50">
                    DOB: {formData.date_of_birth || "Not set"}
                    <br />
                    Age: {formData.age || "Not set"}
                    <br />
                    Gender: {formData.gender || "Not set"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-orange-100">Critical notes</div>
                  <div className="mt-2 text-sm leading-7 text-orange-50">
                    Medications: {formData.medications || "Not set"}
                    <br />
                    Donor: {formData.organ_donor_status ? formData.organ_donor_status.toUpperCase() : "Not set"}
                    {formData.organ_donor_status === "yes" && formData.organ_donor_details ? ` (${formData.organ_donor_details})` : ""}
                    {formData.gender === "female" ? (
                      <>
                        <br />
                        Pregnancy: {formData.pregnancy_status || "Not set"}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-400">Emergency info form</div>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-stone-900">Complete the details once</h2>
            </div>
            <div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
              <AlertTriangle size={22} />
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <input className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Patient full name" />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <input className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div>
              <FieldLabel>Emergency Contact</FieldLabel>
              <input className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.emergency_contact} onChange={(e) => updateField("emergency_contact", e.target.value)} placeholder="Name - phone - relation" />
            </div>
            <div>
              <FieldLabel>Date of Birth</FieldLabel>
              <input className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" type="date" value={formData.date_of_birth} onChange={(e) => updateField("date_of_birth", e.target.value)} />
            </div>
            <div>
              <FieldLabel>Age</FieldLabel>
              <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <CalendarDays size={16} className="text-stone-400" />
                <span>{formData.age || "Calculated from date of birth"}</span>
              </div>
            </div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <select className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.gender} onChange={(e) => updateField("gender", e.target.value as Gender)}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            {formData.gender === "female" ? (
              <div className="md:col-span-2">
                <FieldLabel>Pregnancy Status</FieldLabel>
                <select className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.pregnancy_status} onChange={(e) => updateField("pregnancy_status", e.target.value)}>
                  <option value="">Select pregnancy status</option>
                  <option value="pregnant">Pregnant</option>
                  <option value="not_pregnant">Not pregnant</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            ) : null}

            <div className="md:col-span-2">
              <FieldLabel>Blood Group</FieldLabel>
              <div className="grid grid-cols-4 gap-2">
                {BLOOD_GROUPS.map((bloodGroup) => (
                  <button
                    key={bloodGroup}
                    type="button"
                    onClick={() => updateField("blood_group", bloodGroup)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${formData.blood_group === bloodGroup ? "border-orange-600 bg-orange-600 text-white shadow-sm" : "border-stone-200 bg-stone-50 text-stone-700 hover:border-orange-300 hover:bg-orange-50"}`}
                  >
                    {bloodGroup}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <FieldLabel>Current Medications</FieldLabel>
              <textarea className="min-h-[92px] w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.medications} onChange={(e) => updateField("medications", e.target.value)} placeholder="List current medications and dosages" />
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Chronic Conditions</FieldLabel>
              <textarea className="min-h-[92px] w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.chronic_conditions} onChange={(e) => updateField("chronic_conditions", e.target.value)} placeholder="Diabetes, asthma, epilepsy, hypertension..." />
            </div>
            <div>
              <FieldLabel>Allergies</FieldLabel>
              <textarea className="min-h-[92px] w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.allergies} onChange={(e) => updateField("allergies", e.target.value)} placeholder="Penicillin, peanuts, latex..." />
            </div>
            <div>
              <FieldLabel>Past Surgeries</FieldLabel>
              <textarea className="min-h-[92px] w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.surgeries} onChange={(e) => updateField("surgeries", e.target.value)} placeholder="Appendectomy (2021), knee surgery..." />
            </div>

            <div>
              <FieldLabel>Organ Donor Status</FieldLabel>
              <select className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.organ_donor_status} onChange={(e) => updateField("organ_donor_status", e.target.value as DonorStatus)}>
                <option value="">Select status</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {formData.organ_donor_status === "yes" ? (
              <div>
                <FieldLabel>If Yes, Which Organs</FieldLabel>
                <input className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500" value={formData.organ_donor_details} onChange={(e) => updateField("organ_donor_details", e.target.value)} placeholder="Kidneys, liver, corneas..." />
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-400">Live actions</div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-stone-900">Generate after save</h2>
              </div>
              <div className="rounded-2xl bg-stone-100 p-3 text-stone-600">
                <UserRound size={22} />
              </div>
            </div>

            <div className="rounded-[28px] border border-stone-900/5 bg-[linear-gradient(180deg,#7f1d1d_0%,#b91c1c_48%,#ea580c_100%)] p-6 text-white shadow-[0_18px_45px_rgba(127,29,29,0.28)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                <ShieldCheck size={13} />
                Live e-card preview
              </div>
              <div className="mt-5 text-3xl font-black tracking-[-0.04em]">{formData.name || "Your name"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">Phone: {formData.phone || "Not set"}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">Blood Group: {formData.blood_group || "N/A"}</span>
              </div>
              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-orange-100">Identity</div>
                  <div className="mt-2 text-sm leading-7 text-orange-50">
                    DOB: {formData.date_of_birth || "Not set"}
                    <br />
                    Age: {formData.age || "Not set"}
                    <br />
                    Gender: {formData.gender || "Not set"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-orange-100">Critical notes</div>
                  <div className="mt-2 text-sm leading-7 text-orange-50">
                    Medications: {formData.medications || "Not set"}
                    <br />
                    Donor: {formData.organ_donor_status ? formData.organ_donor_status.toUpperCase() : "Not set"}
                    {formData.organ_donor_status === "yes" && formData.organ_donor_details ? ` (${formData.organ_donor_details})` : ""}
                    {formData.gender === "female" ? (
                      <>
                        <br />
                        Pregnancy: {formData.pregnancy_status || "Not set"}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,#fff_0%,#fafaf9_100%)] p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">E-card status</div>
                <div className="mt-2 text-lg font-bold text-stone-900">{saved ? "Ready" : "Waiting for first save"}</div>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Saving the form creates the patient e-card. After that, the preview button opens the live emergency card URL.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button className="bg-orange-600 text-white hover:bg-orange-700" onClick={handleSaveProfile} isLoading={saving} disabled={!formData.name || !formData.phone || !formData.date_of_birth}>
                  Save Emergency Card
                </Button>
                <Button variant="outline" onClick={() => patientId && window.open(ecardUrl, "_blank", "noopener,noreferrer")} disabled={!saved || !patientId}>
                  Preview E-Card
                </Button>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,#fff_0%,#fff7ed_100%)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Global QR</div>
                    <div className="mt-2 text-lg font-bold text-stone-900">{showQr && patientId ? "Generated and previewable" : "Not generated yet"}</div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                      This QR is public and opens the latest emergency e-card, so the preview now works directly in the app.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
                    <QrCode size={22} />
                  </div>
                </div>

                <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-[28px] border border-dashed border-orange-200 bg-white">
                  {showQr && patientId ? (
                    <img src={qrUrl} alt="Emergency QR Code" className="h-56 w-56 rounded-2xl object-contain" />
                  ) : (
                    <div className="px-6 text-center text-stone-400">
                      <QrCode size={52} className="mx-auto" />
                      <div className="mt-4 text-sm font-medium">Save the card first, then generate the QR.</div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button className="bg-stone-900 text-white hover:bg-stone-800" onClick={handleGenerateQr} disabled={!saved || !patientId}>
                    Show QR Preview
                  </Button>
                  <Button variant="outline" onClick={handleDownloadQr} disabled={!showQr || !patientId}>
                    <Download size={14} className="mr-1" />
                    Download QR
                  </Button>
                  {saved && patientId ? (
                    <a href={ecardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800">
                      Open live e-card <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
