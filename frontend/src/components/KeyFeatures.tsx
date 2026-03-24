import { QrCode, ShieldAlert, Eye, Check } from "lucide-react";

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
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose Us?</h2>
                    <p className="text-gray-500 max-w-2xl mx-auto">
                        Built for speed, security, and absolute patient control.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Feature 1: Instant QR Access - Muted */}
                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <QrCode size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 text-blue-600 transition-transform duration-300">
                            <QrCode size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            Instant QR Access
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            Eliminate paperwork and delays. Share your full medical history with a single scan.
                            Secure, dynamic, and time-limited.
                        </p>
                    </div>

                    {/* Feature 2: Emergency Break Glass - Featured (Visual Anchor) */}
                    <div className="group relative bg-white rounded-2xl p-8 shadow-md hover:shadow-2xl transition-all duration-300 border border-red-100 md:-mt-4 md:mb-4 bg-gradient-to-b from-white to-red-50/30 ring-1 ring-red-100 hover:ring-red-200">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ShieldAlert size={120} className="text-red-600" />
                        </div>

                        <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center mb-6 text-white shadow-lg shadow-red-200 group-hover:scale-110 transition-transform duration-300 animate-pulse-slow">
                            <ShieldAlert size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-red-600 transition-colors">
                            Emergency Protocol
                        </h3>
                        <p className="text-gray-600 leading-relaxed group-hover:text-gray-700">
                            "Break Glass" capability ensures data is available to doctors in life-threatening situations,
                            even without your consent.
                        </p>

                        <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 py-1.5 px-3 rounded-full w-fit">
                            <Check size={12} /> Always Available
                        </div>
                    </div>

                    {/* Feature 3: Transparency - Muted */}
                    <div className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-10 transition-opacity">
                            <Eye size={120} className="text-gray-400" />
                        </div>

                        <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mb-6 text-gray-600 transition-transform duration-300">
                            <Eye size={28} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-3 transition-colors">
                            Audit-Grade Transparency
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                            See exactly who accessed your data, when, and for how long.
                            Complete, immutable logs ensure 100% accountability.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
