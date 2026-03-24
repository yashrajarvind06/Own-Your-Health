import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useRef, useEffect } from "react";

export default function DoctorProfileDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { user, logout } = useAuth();

    const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "DR";
    const displayName = "Doctor";
    const email = user?.email || "";

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
                title="Doctor Menu"
            >
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-lg shadow-sm hover:bg-green-200 transition-colors border-2 border-white ring-2 ring-gray-100">
                    {initials}
                </div>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50 rounded-t-xl">
                        <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{email}</p>
                    </div>

                    <div className="py-2">
                        {/* Doctor Specific Links */}
                        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Workstation
                        </div>
                        <Link
                            to="/doctor"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>🔍</span> Scanner & Dashboard
                        </Link>
                        <Link
                            to="/doctor/logs"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            <span>📜</span> My Access Logs
                        </Link>

                        <div className="border-t border-gray-50 my-1"></div>

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
