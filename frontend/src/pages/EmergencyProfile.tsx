import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Info, Plus, Trash2, Save, PenSquare, X, Check, Droplet, Activity } from "lucide-react";

interface EmergencyContact {
    name: string;
    phone: string;
    relation: string;
}

interface EmergencyProfileData {
    blood_group: string;
    allergies: string;
    chronic_conditions: string;
    past_surgeries?: string;
    emergency_contacts: EmergencyContact[];
}

export default function EmergencyProfile() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Data State
    const [formData, setFormData] = useState<EmergencyProfileData>({
        blood_group: "",
        allergies: "",
        chronic_conditions: "",
        past_surgeries: "",
        emergency_contacts: []
    });

    // UI State for "Dirty Check"
    const [initialDataStr, setInitialDataStr] = useState("");

    // Section Edit States
    const [isEditingBlood, setIsEditingBlood] = useState(false);
    const [isEditingConditions, setIsEditingConditions] = useState(false);
    const [isEditingContacts, setIsEditingContacts] = useState(false);
    const [isEditingAllergies, setIsEditingAllergies] = useState(false);

    // Allergies Helper
    const [newAllergy, setNewAllergy] = useState("");
    const allergyList = formData.allergies
        ? formData.allergies.split(",").map(s => s.trim()).filter(Boolean)
        : [];

    const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const data = await api("/emergency/profile/me");

            const loadedData = {
                blood_group: data.blood_group || "",
                allergies: data.allergies || "",
                chronic_conditions: data.chronic_conditions || "",
                past_surgeries: data.past_surgeries || "",
                emergency_contacts: data.emergency_contacts || []
            };

            setFormData(loadedData);
            setInitialDataStr(JSON.stringify(loadedData));

        } catch (err: any) {
            if (err.message && (err.message.includes("404") || err.message.includes("not set"))) {
                setInitialDataStr(JSON.stringify(formData));
            } else {
                console.error("Load Error", err);
            }
        } finally {
            setLoading(false);
        }
    };

    // Dirty Check
    const isDirty = JSON.stringify(formData) !== initialDataStr;

    // --- Handlers ---

    const updateField = (field: keyof EmergencyProfileData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Allergies
    const addAllergy = () => {
        if (!newAllergy.trim()) return;
        const current = allergyList;
        if (!current.includes(newAllergy.trim())) {
            const updated = [...current, newAllergy.trim()];
            updateField("allergies", updated.join(", "));
        }
        setNewAllergy("");
    };

    const removeAllergy = (tag: string) => {
        const updated = allergyList.filter(t => t !== tag);
        updateField("allergies", updated.join(", "));
    };

    // Contacts
    const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
        const newContacts = [...formData.emergency_contacts];
        newContacts[index] = { ...newContacts[index], [field]: value };
        updateField("emergency_contacts", newContacts);
    };

    const addContact = () => {
        updateField("emergency_contacts", [...formData.emergency_contacts, { name: "", phone: "", relation: "" }]);
    };

    const removeContact = (index: number) => {
        updateField("emergency_contacts", formData.emergency_contacts.filter((_, i) => i !== index));
    };

    // Save
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await api("/emergency/profile", {
                method: "POST",
                body: JSON.stringify(formData)
            });
            setSuccess("Synced successfully.");
            setInitialDataStr(JSON.stringify(formData));

            setIsEditingBlood(false);
            setIsEditingConditions(false);
            setIsEditingContacts(false);
            setIsEditingAllergies(false);

            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setFormData(JSON.parse(initialDataStr));
        setIsEditingBlood(false);
        setIsEditingConditions(false);
        setIsEditingContacts(false);
        setIsEditingAllergies(false);
    };

    if (loading) return <div className="p-12 text-center text-gray-500">Loading profile...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8 pb-32 animate-in fade-in duration-500">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Emergency Profile</h1>
                <p className="text-gray-500 mt-1">Critical information doctors may see in emergencies</p>
            </div>

            {/* Error/Success */}
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

            {/* Banner - Downgraded Drama */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-3">
                <div className="p-1 text-gray-400 shrink-0 mt-0.5">
                    <Info size={18} />
                </div>
                <div className="text-sm text-gray-600 leading-relaxed">
                    This information may be accessed by doctors using Emergency Override (Break Glass).
                    You will always see when it is accessed.
                </div>
            </div>

            {/* --- SECTIONS --- */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Left Column: Blood Group & Allergies */}
                <div className="space-y-8">

                    {/* Blood Group */}
                    <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Blood Group</h2>
                            {!isEditingBlood && (
                                <Button variant="ghost" size="sm" onClick={() => setIsEditingBlood(true)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 text-xs">
                                    Change
                                </Button>
                            )}
                        </div>

                        {isEditingBlood ? (
                            <div className="animate-in fade-in zoom-in-95 duration-200">
                                <div className="grid grid-cols-4 gap-2">
                                    {bloodTypes.map(type => (
                                        <button
                                            key={type}
                                            onClick={() => updateField("blood_group", type)}
                                            className={`py-2 rounded-lg text-sm font-bold transition-all border
                                                ${formData.blood_group === type
                                                    ? "bg-blue-600 border-blue-600 text-white ring-2 ring-blue-200"
                                                    : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <Button size="sm" variant="outline" onClick={() => setIsEditingBlood(false)}>Done</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 mt-2">
                                <div className="text-2xl font-bold text-gray-900">
                                    {formData.blood_group || <span className="text-gray-300 text-xl font-normal italic">Not Set</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Allergies */}
                    <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Allergies</h2>
                            {!isEditingAllergies && (
                                <Button variant="ghost" size="sm" onClick={() => setIsEditingAllergies(true)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 text-xs">
                                    {allergyList.length === 0 ? "Add allergy" : "Edit"}
                                </Button>
                            )}
                        </div>

                        {isEditingAllergies ? (
                            <div className="animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {allergyList.map((tag, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-gray-800 text-sm font-medium border border-gray-200 shadow-sm">
                                            {tag}
                                            <button onClick={() => removeAllergy(tag)} className="text-gray-400 hover:text-red-500 transition-colors"><X size={14} /></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="Type allergy and press Enter..."
                                        value={newAllergy}
                                        onChange={e => setNewAllergy(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addAllergy();
                                            }
                                        }}
                                    />
                                    <Button size="sm" onClick={addAllergy}>Add</Button>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <Button size="sm" variant="outline" onClick={() => setIsEditingAllergies(false)}>Done</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2">
                                {allergyList.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {allergyList.map((tag, idx) => (
                                            <div key={idx} className="text-gray-900 font-medium flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                                {tag}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-gray-400 italic">None reported</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Medical Conditions */}
                <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm h-full">
                    <div className="flex items-start justify-between mb-4">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Medical Conditions</h2>
                        {!isEditingConditions && (
                            <Button variant="ghost" size="sm" onClick={() => setIsEditingConditions(true)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 text-xs">
                                Edit
                            </Button>
                        )}
                    </div>

                    {isEditingConditions ? (
                        <div className="animate-in fade-in zoom-in-95 duration-200 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Chronic Conditions</label>
                                <textarea
                                    value={formData.chronic_conditions}
                                    onChange={e => updateField("chronic_conditions", e.target.value)}
                                    className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                                    rows={5}
                                    placeholder="e.g. Diabetes, Asthma..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Past Surgeries</label>
                                <textarea
                                    value={formData.past_surgeries || ""}
                                    onChange={e => updateField("past_surgeries", e.target.value)}
                                    className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                                    rows={5}
                                    placeholder="e.g. Appendectomy (2015)..."
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button size="sm" variant="outline" onClick={() => setIsEditingConditions(false)}>Done</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 mt-2">
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 mb-2">Chronic:</h3>
                                <div className="text-gray-900 whitespace-pre-line leading-relaxed">
                                    {formData.chronic_conditions || "None reported"}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 mb-2">Past surgeries:</h3>
                                <div className="text-gray-900 whitespace-pre-line leading-relaxed">
                                    {formData.past_surgeries || "None reported"}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Emergency Contacts - Full Width Below */}
            <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Emergency Contacts</h2>
                    {!isEditingContacts && (
                        <Button variant="ghost" size="sm" onClick={() => setIsEditingContacts(true)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 text-xs">
                            Manage
                        </Button>
                    )}
                </div>

                {isEditingContacts ? (
                    <div className="animate-in fade-in zoom-in-95 duration-200 space-y-4">
                        <div className="space-y-3">
                            {formData.emergency_contacts.map((contact, index) => (
                                <div key={index} className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded border border-gray-200 shadow-sm relative group">
                                    <button
                                        onClick={() => removeContact(index)}
                                        className="absolute -top-2 -right-2 bg-red-100 text-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity border border-red-200"
                                        title="Remove"
                                    >
                                        <X size={12} />
                                    </button>

                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Name</label>
                                        <input
                                            value={contact.name}
                                            onChange={e => updateContact(index, "name", e.target.value)}
                                            className="w-full text-sm border-b border-gray-200 py-1 focus:border-blue-500 focus:outline-none font-medium"
                                            placeholder="Name"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Phone</label>
                                        <input
                                            value={contact.phone}
                                            onChange={e => updateContact(index, "phone", e.target.value)}
                                            className="w-full text-sm border-b border-gray-200 py-1 focus:border-blue-500 focus:outline-none font-mono"
                                            placeholder="Phone"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Relation</label>
                                        <input
                                            value={contact.relation}
                                            onChange={e => updateContact(index, "relation", e.target.value)}
                                            className="w-full text-sm border-b border-gray-200 py-1 focus:border-blue-500 focus:outline-none"
                                            placeholder="Relation"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-4">
                            <Button size="sm" variant="outline" onClick={addContact}> <Plus size={14} className="mr-1" /> Add Contact</Button>
                            <Button size="sm" onClick={() => setIsEditingContacts(false)}>Done</Button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-hidden">
                        {formData.emergency_contacts.length > 0 ? (
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                                        <th className="font-semibold py-2">Name</th>
                                        <th className="font-semibold py-2">Phone</th>
                                        <th className="font-semibold py-2">Relation</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {formData.emergency_contacts.map((contact, index) => (
                                        <tr key={index}>
                                            <td className="py-3 font-medium text-gray-900">
                                                {contact.name}
                                                {index === 0 && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold border border-gray-200">PRIMARY</span>}
                                            </td>
                                            <td className="py-3 font-mono text-gray-600">{contact.phone}</td>
                                            <td className="py-3 text-gray-500">{contact.relation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-gray-400 italic text-sm">No contacts added.</div>
                        )}
                    </div>
                )}
            </div>

            {/* Sticky Footer */}
            {isDirty && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50 animate-in slide-in-from-bottom-full duration-300">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <div className="text-sm text-gray-500 font-medium flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                            Unsaved changes
                        </div>
                        <div className="flex gap-3">
                            <Button variant="ghost" className="text-gray-500 hover:text-gray-700 hover:bg-gray-100" onClick={handleDiscard}>
                                Discard
                            </Button>
                            <Button onClick={handleSave} isLoading={saving} className="bg-blue-600 text-white hover:bg-blue-700 min-w-[120px] shadow-sm">
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
