import { useState, useEffect } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Link } from "react-router-dom";
import { api } from "../api";

// --- Icons ---
const Icons = {
    User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    Mail: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    Shield: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    Activity: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    Stethoscope: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>, // Heart shape for care
    Lock: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
    Key: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.535 10.9a1 1 0 00-.966.273l-.966.966a1 1 0 00-.27.966L8.94 13.9a1 1 0 00-.966.273l-1.115 1.115a1 1 0 00-.27.966L1.6 19.833a1 1 0 00.283 1.25l2.4 2.4a1 1 0 001.25.283l3.583-5.023a1 1 0 00.27-.966l.966-.966a1 1 0 00.273-.966L13.257 11.257A6 6 0 0121 9a2 2 0 01-2-2z" /></svg>,
    Logout: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
    ArrowRight: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
    Check: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
    DoctorBadge: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m-9-2a9 9 0 1118 0 9 9 0 01-18 0z" /></svg>,
    PatientBadge: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    UserCheck: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 8l-2 2-1-1" /></svg>
};

interface UserProfile {
    id: number;
    display_name: string | null;
    email: string;
    role: string;
}

export default function ProfilePage() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Edit State for Display Name
    const [editName, setEditName] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [nameMessage, setNameMessage] = useState("");

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // 1. Fetch User Identity
            const userData = await api("/user/me/profile");
            setUser(userData);
            // If display_name is null/empty, setEditName to empty string.
            // Do NOT infer or fallback to anything else.
            setEditName(userData.display_name || "");
        } catch (err: any) {
            setError("Unable to load profile information");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveName() {
        if (!editName.trim()) {
            return;
        }

        setSavingName(true);
        setNameMessage("");
        try {
            await api("/user/me/display-name", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name: editName.trim() })
            });

            // Update local state without refetching
            setUser(prev => prev ? { ...prev, display_name: editName.trim() } : null);
            setNameMessage("Display name updated successfully");
            setTimeout(() => setNameMessage(""), 3000);
        } catch (err: any) {
            setNameMessage("Error: " + err.message);
        } finally {
            setSavingName(false);
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Loading profile...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!user) return <div className="p-8 text-center">User not found.</div>;

    const isDoctor = user.role === "doctor";
    // Badge Label
    const badgeLabel = isDoctor ? "Doctor Account" : "Patient Account";
    const BadgeIcon = isDoctor ? Icons.DoctorBadge : Icons.PatientBadge;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 px-4 sm:px-6">
            {/* 1. Page Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">My Profile</h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        {isDoctor ? "Manage your professional identity and account security" : "Manage your account identity and security settings"}
                    </p>
                </div>
                <div className="hidden sm:block">
                    <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm border ${isDoctor ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                        <BadgeIcon />
                        {badgeLabel}
                    </span>
                </div>
            </div>

            {/* 2. Banner: Professional Account (Doctor) OR Patient Ownership (Patient) */}
            {isDoctor ? (
                <div className="bg-gradient-to-r from-blue-50 to-white border border-blue-100 p-6 rounded-xl flex gap-5 items-start shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex-shrink-0 bg-blue-100 p-3 rounded-full text-blue-600">
                        <Icons.Stethoscope />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-blue-900">Professional Account Authorization</h3>
                        <div className="mt-2 text-sm text-blue-700 space-y-1">
                            <p>This account is strictly intended for authorized medical professionals.</p>
                            <p>For accountability, all patient record access is traceable and permanently audited.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 p-6 rounded-xl flex gap-5 items-start shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex-shrink-0 bg-emerald-100 p-3 rounded-full text-emerald-600">
                        <Icons.UserCheck />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-emerald-900">Patient-Owned Record</h3>
                        <div className="mt-2 text-sm text-emerald-700 space-y-1">
                            <p>You are in full control of who can access your medical data.</p>
                            <p>All access requests and emergency views are visible to you.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column (Main Identity) - Spans 2 cols for both roles now to match symmetry */}
                <div className="lg:col-span-2 space-y-6">
                    {/* 3. Identity Section */}
                    <Card
                        title={isDoctor ? "Professional Identity" : "Account Identity"}
                        description={isDoctor ? "Your visible identity in patient logs." : "Basic information used to identify you in the system."}
                        className="h-full border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300"
                    >
                        <div className="space-y-6 p-1">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <Icons.User />
                                    Display Name
                                </label>
                                <div className="relative group">
                                    <Input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Enter your display name"
                                        className="pr-24 transition-all duration-200 focus:ring-2 focus:ring-blue-100"
                                    />
                                    <div className="absolute right-1 top-1 bottom-1 z-10">
                                        <Button
                                            size="sm"
                                            onClick={handleSaveName}
                                            disabled={savingName || !editName.trim() || editName === (user.display_name || "")}
                                            className={`h-full px-4 text-xs font-semibold shadow-sm transition-all duration-200 disabled:opacity-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-transparent rounded-md ${editName === (user.display_name || "")
                                                ? "bg-gray-100 text-gray-400 border border-transparent"
                                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md border border-blue-600 transform active:scale-95"
                                                }`}
                                        >
                                            {savingName ? "Saving..." : "Save"}
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 ml-1">
                                    {isDoctor ? "Shown to patients in audit logs." : "Shown in system access logs."}
                                </p>
                                {nameMessage && <p className="text-sm text-green-600 mt-2 font-medium flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                                    <Icons.Check /> {nameMessage}
                                </p>}
                            </div>

                            <div className="h-px bg-gray-100 my-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                        <Icons.Mail />
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Input value={user.email} readOnly disabled className="bg-gray-50 text-gray-600 cursor-not-allowed border-gray-200 font-mono text-sm pl-3" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                        <Icons.Shield />
                                        Role
                                    </label>
                                    <div className="flex items-center h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 capitalize font-medium shadow-sm">
                                        {user.role}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column (Sidebar: Data Control & Security) */}
                <div className="space-y-6">

                    {/* 4/5. Data Control (Patient) OR Capabilities (Doctor) */}
                    {isDoctor ? (
                        // REPLACED Card with custom div to force colors
                        <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
                            <div className="px-6 py-4 border-b border-blue-100">
                                <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                                    <span>🔐 Your Capabilities</span>
                                </h3>
                            </div>
                            <div className="p-6 text-sm text-blue-900 space-y-4">
                                <p className="font-semibold text-blue-900 flex items-center gap-2">
                                    <Icons.DoctorBadge />
                                    <span>Authorized Actions</span>
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-3">
                                        <span className="text-blue-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Request time-bound access to patient medical records</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-blue-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">View emergency profiles during critical situations</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-blue-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Verify patient identities with secure QR scanning</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-blue-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">All actions are logged and visible to patients</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        // REPLACED Card with custom div to force colors
                        <div className="bg-emerald-50 rounded-xl shadow-sm border border-emerald-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
                            <div className="px-6 py-4 border-b border-emerald-100">
                                <h3 className="text-lg font-semibold text-emerald-900 flex items-center gap-2">
                                    <span>🔐 Your Data Control</span>
                                </h3>
                            </div>
                            <div className="p-6 text-sm text-emerald-900 space-y-4">
                                <p className="font-semibold text-emerald-900">As a patient on this platform, you can:</p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-3">
                                        <span className="text-emerald-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Grant or deny time-bound access to doctors</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-emerald-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Share access instantly using QR codes</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-emerald-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Allow emergency doctors to view critical information</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="text-emerald-600 mt-0.5"><Icons.Check /></span>
                                        <span className="leading-tight">Review a complete audit trail of all access</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* 5. Security Section */}
                    <Card title="Security" description="Manage your account security" className="border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="space-y-3">
                            <div className="group flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-blue-100 text-gray-600 group-hover:text-blue-600 transition-colors">
                                        <Icons.Key />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">Password</h4>
                                        <p className="text-xs text-gray-500">Change your login password</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => alert("Change Password flow would go here")} className="bg-white hover:bg-white text-gray-600 border-gray-200">
                                    Change
                                </Button>
                            </div>

                            <div className="group flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-100 hover:bg-red-50 hover:border-red-200 transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                        <Icons.Logout />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-red-900">Sign Out</h4>
                                        <p className="text-xs text-red-700">Log out from this device</p>
                                    </div>
                                </div>
                                <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800 hover:border-red-300 whitespace-nowrap bg-red-50" size="sm" onClick={() => {
                                    if (confirm("Are you sure you want to logout?")) {
                                        localStorage.removeItem("token");
                                        window.location.href = "/login";
                                    }
                                }}>
                                    Logout
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* 6. Footer Navigation */}
            <div className="text-center pt-8 border-t border-gray-100 pb-4">
                <Link to="/dashboard" className="group inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold px-5 py-2.5 rounded-full hover:bg-blue-50 transition-all duration-200 text-sm">
                    <span className="text-center">
                        {isDoctor
                            ? "View active sessions & audit logs"
                            : "Manage access permissions, emergency medical information, and activity logs from your Dashboard"
                        }
                    </span>
                    <span className="group-hover:translate-x-1 transition-transform"><Icons.ArrowRight /></span>
                </Link>
            </div>
        </div>
    );
}
