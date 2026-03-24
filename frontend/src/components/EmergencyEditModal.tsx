import { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

interface EmergencyEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: any;
    onSave: (data: any) => Promise<void>;
}

export default function EmergencyEditModal({ isOpen, onClose, initialData, onSave }: EmergencyEditModalProps) {
    const [formData, setFormData] = useState(initialData || {});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFormData(initialData || {});
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error("Failed to save", error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden transform transition-all scale-100">
                <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                    <h3 className="text-white font-bold text-lg">Edit Emergency Profile</h3>
                    <button onClick={onClose} className="text-blue-100 hover:text-white transition-colors">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                            <select
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={formData.blood_group || ""}
                                onChange={(e) => handleChange("blood_group", e.target.value)}
                            >
                                <option value="">Select</option>
                                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => (
                                    <option key={bg} value={bg}>{bg}</option>
                                ))}
                            </select>
                        </div>
                        <Input
                            label="Emergency Contact"
                            placeholder="+1 234 567 8900"
                            value={formData.emergency_contact || ""}
                            onChange={(e) => handleChange("emergency_contact", e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={2}
                            placeholder="e.g. Penicillin, Peanuts..."
                            value={formData.allergies || ""}
                            onChange={(e) => handleChange("allergies", e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Chronic Conditions</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={2}
                            placeholder="e.g. Diabetes, Hypertension..."
                            value={formData.chronic_diseases || ""}
                            onChange={(e) => handleChange("chronic_diseases", e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Current Medications</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={2}
                            placeholder="e.g. Metformin 500mg..."
                            value={formData.medications || ""}
                            onChange={(e) => handleChange("medications", e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Past Surgeries</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={2}
                            placeholder="e.g. Appendectomy (2015)..."
                            value={formData.past_surgeries || ""}
                            onChange={(e) => handleChange("past_surgeries", e.target.value)}
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                        <Button type="submit" isLoading={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">Save Changes</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
