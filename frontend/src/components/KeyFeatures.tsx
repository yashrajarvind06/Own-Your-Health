import { Activity, QrCode, ShieldCheck, Check } from "lucide-react";

export default function KeyFeatures() {
    return (
        <section className="py-20 bg-gray-50 relative overflow-hidden">
            {/* Background Decorations - Toned down slightly */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-50/50 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-50/50 rounded-full blur-3xl opacity-40 translate-y-1/3 -translate-x-1/4"></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Built For Real Clinical Workflows</h2>
                    <p className="text-gray-500 max-w-2xl mx-auto">
                        Every feature is designed around trust, visibility, and patient-controlled sharing.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <QrCode size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 text-blue-600 transition-transform duration-300">
                            <QrCode size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            Secure Record Sharing
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            Patients can share records with time-bound QR access or send direct requests to doctors,
                            while every approval remains explicit and trackable.
                        </p>
                    </div>

                    <div className="group relative bg-white rounded-2xl p-8 shadow-md hover:shadow-2xl transition-all duration-300 border border-red-100 md:-mt-4 md:mb-4 bg-gradient-to-b from-white to-red-50/30 ring-1 ring-red-100 hover:ring-red-200">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <QrCode size={120} className="text-red-600" />
                        </div>

                        <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center mb-6 text-white shadow-lg shadow-red-200 group-hover:scale-110 transition-transform duration-300 animate-pulse-slow">
                            <QrCode size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-red-600 transition-colors">
                            Emergency QR &amp; Instant Access
                        </h3>
                        <p className="text-gray-600 leading-relaxed group-hover:text-gray-700">
                            Patients can generate a secure emergency QR that reveals critical health data instantly —
                            even without the app. In emergencies, doctors can scan and access life-saving details like
                            allergies, blood group, and conditions within seconds.
                        </p>

                        <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 py-1.5 px-3 rounded-full w-fit">
                            <Check size={12} /> Works Without App
                        </div>
                    </div>

                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <Activity size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mb-6 text-gray-600 transition-transform duration-300">
                            <Activity size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            OCR Reports And Health Trends
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            Uploaded reports can be processed into structured metrics like blood pressure, heart rate,
                            glucose, and report dates to power timeline-based health insights.
                        </p>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <ShieldCheck size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 text-blue-600 transition-transform duration-300">
                            <ShieldCheck size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            Verified Doctor Layer (HPR Verified)
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            HPR verification ensures patients interact only with trusted medical professionals.
                            Sensitive actions are restricted to verified doctors, creating a secure and accountable
                            healthcare environment.
                        </p>
                    </div>

                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <ShieldCheck size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center mb-6 text-slate-700 transition-transform duration-300">
                            <ShieldCheck size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            Minimal, Auditable Security
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            Duplicate requests are blocked, role checks stay strict, emergency access is logged,
                            and report cards clearly show whether a patient or a verified doctor uploaded them.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
