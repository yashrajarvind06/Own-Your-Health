import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useRef, useEffect } from "react";

export default function PatientProfileDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { user, logout } = useAuth();

    const name = user?.display_name || "Patient";
    const email = user?.email || "";

    const initials = (() => {
        const n = name.trim();
        if (!n) return "PA";
        const parts = n.split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return n.substring(0, 1).toUpperCase();
    })();

    const toggleOpen = () => setIsOpen(!isOpen);

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
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50 rounded-t-xl">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900">{name}</p>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 uppercase tracking-wide border border-emerald-100">
                                Patient
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{email}</p>
                    </div>

                    <div className="py-2">
                        <Link
                            to="/patient/emergency-profile"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>🩺</span> Emergency Profile
                        </Link>
                        <Link
                            to="/patient/records"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>📄</span> My Records
                        </Link>
                        <Link
                            to="/patient/history"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>👁️</span> Access History
                        </Link>
                        <Link
                            to="/profile"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>⚙️</span> Account Settings
                        </Link>
                    </div>

                    <div className="border-t border-gray-50 py-1 mt-1">
                        <button
                            onClick={logout}
                            className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <span>🚪</span> Logout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
