import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useRef, useEffect } from "react";
import { api } from "../api";

interface SwitchableProfile {
    id: number;
    switch_target_id: number | null;
    name: string;
    email?: string | null;
    relationship: string;
    profile_mode: "self" | "linked" | "return";
    is_active: boolean;
}

export default function PatientProfileDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const [profiles, setProfiles] = useState<SwitchableProfile[]>([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { user, logout } = useAuth();

    const name = user?.display_name || user?.email || "Patient";
    const email = user?.email || "";

    const initials = (() => {
        const n = name.trim();
        if (!n) return "PA";
        const parts = n.split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return n.substring(0, 1).toUpperCase();
    })();

    const toggleOpen = () => setIsOpen(!isOpen);
    const switchTargets = profiles.filter((profile) => !profile.is_active);

    const fetchProfiles = async () => {
        try {
            setLoadingProfiles(true);
            const res = await api("/profiles/");
            if (Array.isArray(res?.data)) {
                setProfiles(res.data);
            } else {
                setProfiles([]);
            }
        } catch (err) {
            console.error("Profile fetch error", err);
            setProfiles([]);
        } finally {
            setLoadingProfiles(false);
        }
    };

    useEffect(() => {
        if (!user || !isOpen) {
            return;
        }

        fetchProfiles();
    }, [isOpen, user?.id]);

    useEffect(() => {
        const handleAuthChange = () => {
            if (isOpen) {
                fetchProfiles();
            }
        };

        window.addEventListener("auth-change", handleAuthChange);
        return () => window.removeEventListener("auth-change", handleAuthChange);
    }, [isOpen]);

    const switchProfile = async (targetId: number | null) => {
        if (!targetId) return;

        try {
            const res = await api(`/profiles/switch/${targetId}`, { method: "POST" });
            const nextToken = res?.data?.access_token;

            if (nextToken) {
                sessionStorage.clear();
                localStorage.setItem("token", nextToken);
                localStorage.removeItem("role");
                localStorage.removeItem("user_id");
                window.dispatchEvent(new Event("auth-change"));
                window.location.reload();
            }
        } catch (err) {
            console.error("Switch failed", err);
        }
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={toggleOpen}
                className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95"
                title="Profile Menu"
            >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-lg shadow-sm hover:bg-blue-200 transition-colors border-2 border-white ring-2 ring-gray-100">
                    {initials}
                </div>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50 rounded-t-xl">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900">{name}</p>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 uppercase tracking-wide border border-emerald-100">
                                Patient
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{email}</p>
                    </div>

                    <div>
                        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">
                            Switch Profile
                        </div>

                        {loadingProfiles && switchTargets.length === 0 && (
                            <p className="px-4 py-2 text-sm text-gray-500">Loading profiles...</p>
                        )}

                        {!loadingProfiles && switchTargets.length === 0 && (
                            <p className="px-4 py-2 text-sm text-gray-500">No linked profiles available</p>
                        )}

                        {switchTargets.map((profile) => (
                            <button
                                key={`${profile.id}-${profile.relationship}`}
                                onClick={() => switchProfile(profile.switch_target_id)}
                                disabled={!profile.switch_target_id}
                                className={`w-full text-left px-4 py-3 text-sm transition ${
                                    profile.switch_target_id
                                        ? "text-gray-700 hover:bg-blue-50"
                                        : "text-gray-400 cursor-not-allowed"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{profile.name}</p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {profile.email || "Managed by your account"}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                        profile.switch_target_id
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-gray-100 text-gray-500"
                                    }`}>
                                        {profile.profile_mode === "return" ? "Return" : profile.relationship}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-gray-50 my-2"></div>

                    <Link
                        to="/patient/emergency-profile"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50"
                        onClick={() => setIsOpen(false)}
                    >
                        Emergency Profile
                    </Link>

                    <Link
                        to="/patient/records"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50"
                        onClick={() => setIsOpen(false)}
                    >
                        My Records
                    </Link>

                    <Link
                        to="/patient/history"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50"
                        onClick={() => setIsOpen(false)}
                    >
                        Access History
                    </Link>

                    <Link
                        to="/profile"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50"
                        onClick={() => setIsOpen(false)}
                    >
                        Account Settings
                    </Link>

                    <div className="border-t border-gray-50 py-1 mt-1">
                        <button
                            onClick={logout}
                            className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
