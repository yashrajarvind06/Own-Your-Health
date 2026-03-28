import { useState } from "react";
import {
    UserPlus,
    QrCode,
    ScanLine,
    CheckCircle,
    Stethoscope,
    Clock,
    FileText,
    ShieldAlert,
    Search,
    ArrowRight
} from "lucide-react";

interface Step {
    id: number;
    icon: React.ElementType;
    title: string;
    description: string;
    color: string;
}

export default function HowItWorks() {
    const [view, setView] = useState<"patients" | "doctors">("patients");

    const patientSteps: Step[] = [
        {
            id: 1,
            icon: UserPlus,
            title: "Create Your Health Vault",
            description: "Register as a patient, upload reports, maintain emergency information, and keep your health records in one secure place.",
            color: "text-blue-600 bg-blue-100"
        },
        {
            id: 2,
            icon: Search,
            title: "Find Verified Doctors",
            description: "Search doctors by name, review verification status, and send direct access requests to trusted professionals.",
            color: "text-blue-600 bg-blue-50"
        },
        {
            id: 3,
            icon: QrCode,
            title: "Share Access Your Way",
            description: "Use a time-limited QR during consultation or approve a direct request from a doctor when you choose to share records.",
            color: "text-green-600 bg-green-50"
        },
        {
            id: 4,
            icon: CheckCircle,
            title: "Track Reports And Trends",
            description: "See uploaded records, doctor-uploaded documents, and OCR-derived trends for blood pressure, heart rate, and glucose.",
            color: "text-orange-600 bg-orange-50"
        }
    ];

    const doctorSteps: Step[] = [
        {
            id: 1,
            icon: Stethoscope,
            title: "Register And Verify",
            description: "Create a doctor account, submit your HPR registration, and unlock patient-data workflows once verification is complete.",
            color: "text-blue-600 bg-blue-100"
        },
        {
            id: 2,
            icon: ScanLine,
            title: "Request Access",
            description: "Scan a patient QR for session-based access or receive direct patient requests from the doctor search workflow.",
            color: "text-blue-600 bg-blue-50"
        },
        {
            id: 3,
            icon: Clock,
            title: "Review Notifications",
            description: "Track pending approvals, open the patient context, and manage access decisions directly from the doctor dashboard.",
            color: "text-green-600 bg-green-50"
        },
        {
            id: 4,
            icon: FileText,
            title: "Continue Care Securely",
            description: "View shared reports, manage active and past patients, and upload reports only when a valid patient relationship exists.",
            color: "text-orange-600 bg-orange-50"
        }
    ];

    const activeSteps = view === "patients" ? patientSteps : doctorSteps;

    return (
        <section className="py-20 bg-white" id="how-it-works">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
                    <p className="text-gray-500 max-w-2xl mx-auto">
                        Two role-specific journeys, one secure platform for access control, verified care, and record continuity.
                    </p>
                </div>

                {/* Toggle */}
                <div className="flex justify-center mb-16">
                    <div className="bg-gray-100 p-1 rounded-xl inline-flex">
                        <button
                            onClick={() => setView("patients")}
                            className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${view === "patients"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-gray-500 hover:text-gray-900"
                                }`}
                        >
                            For Patients
                        </button>
                        <button
                            onClick={() => setView("doctors")}
                            className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${view === "doctors"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-gray-500 hover:text-gray-900"
                                }`}
                        >
                            For Doctors
                        </button>
                    </div>
                </div>

                {/* Steps Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-20 relative">
                    {/* Arrows Layer (Hidden on mobile) */}
                    <div className="hidden md:block absolute top-[28px] left-0 w-full px-16 pointer-events-none">
                        <div className="flex justify-between w-full h-full">
                            <div className="flex-1 text-center text-gray-300 transform translate-x-12 translate-y-2">
                                <ArrowRight size={24} />
                            </div>
                            <div className="flex-1 text-center text-gray-300 transform translate-x-12 translate-y-2">
                                <ArrowRight size={24} />
                            </div>
                            <div className="flex-1 text-center text-gray-300 transform translate-x-12 translate-y-2">
                                <ArrowRight size={24} />
                            </div>
                            <div className="flex-1"></div> {/* Spacer for last item */}
                        </div>
                    </div>

                    {activeSteps.map((step) => (
                        <div key={step.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow relative z-10 h-full flex flex-col">
                            {/* Number Badge */}
                            <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg border-4 border-white">
                                {step.id}
                            </div>

                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-6 mt-2 ${
                                // Dynamic colors per step logic from image usually, but I'll stick to a clean blue theme generally or use the passed color
                                // Actually images show clean blue icons. Let's use blue-100/blue-600 for all
                                "bg-blue-50 text-blue-600"
                                }`}>
                                <step.icon size={24} />
                            </div>

                            <h3 className="font-bold text-lg text-gray-900 mb-3">{step.title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                {step.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Emergency Protocol Box */}
                <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col md:flex-row items-start gap-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl shrink-0">
                        <ShieldAlert size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Emergency Break Glass Protocol</h3>
                        <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                            In life-threatening situations, doctors can trigger emergency access to reach critical patient information quickly.
                            Every emergency action remains logged and separated from full report access for accountability.
                        </p>
                    </div>
                </div>

            </div>
        </section>
    );
}
