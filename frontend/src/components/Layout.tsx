import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/Button";
import ProfileDropdown from "./ProfileDropdown";

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const location = useLocation();

    // Role is derived from user object now
    const role = user?.role;

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 group">
                        {/* SVG Logo Icon */}
                        <svg
                            width="36"
                            height="36"
                            viewBox="0 0 100 100"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                            className="group-hover:scale-110 transition-transform duration-200"
                        >
                            <defs>
                                <linearGradient id="nav-oyh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#1d3a8a" />
                                    <stop offset="100%" stopColor="#00d4aa" />
                                </linearGradient>
                            </defs>
                            <path d="M50 5 L82 20 L82 52 C82 72 66 87 50 95 C34 87 18 72 18 52 L18 20 Z" fill="none" stroke="url(#nav-oyh-grad)" strokeWidth="5" strokeLinejoin="round" />
                            <path d="M22 68 Q50 80 78 68" fill="none" stroke="url(#nav-oyh-grad)" strokeWidth="5" strokeLinecap="round" />
                            <circle cx="45" cy="32" r="8" fill="url(#nav-oyh-grad)" />
                            <path d="M37 45 Q45 58 53 45 Q58 38 50 34" fill="url(#nav-oyh-grad)" />
                            <path d="M52 44 C52 40 56 37 60 40 C64 37 68 40 68 44 C68 51 60 57 60 57 C60 57 52 51 52 44 Z" fill="url(#nav-oyh-grad)" />
                            <path d="M52 48 L55 48 L57 43 L59 53 L61 43 L63 48 L68 48" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <rect x="72" y="12" width="6" height="6" rx="1" fill="#00d4aa" />
                            <rect x="80" y="8" width="8" height="8" rx="1" fill="#00d4aa" />
                            <rect x="80" y="18" width="5" height="5" rx="1" fill="#1d3a8a" />
                            <rect x="72" y="20" width="4" height="4" rx="1" fill="#00aacc" />
                        </svg>
                        <span className="font-extrabold text-xl tracking-tight leading-none">
                            <span style={{ color: "#1d3a8a" }}>Own</span>
                            <span style={{ color: "#00b890" }}>Your</span>
                            <span style={{ color: "#1d3a8a" }}>Health</span>
                        </span>
                    </Link>

                    <nav className="flex items-center gap-1 sm:gap-2">
                        {!role && (
                            <>
                                <Link to="/login">
                                    <Button variant="outline" size="sm">Login</Button>
                                </Link>
                                <Link to="/register">
                                    <Button size="sm">Get Started</Button>
                                </Link>
                            </>
                        )}
                        {role && (
                            <div className="flex items-center gap-4">
                                {role === "patient" && (
                                    <Link to="/patient">
                                        <Button variant={isActive("/patient") ? "primary" : "outline"} size="sm" className={isActive("/patient") ? "" : "border-0 text-gray-600 hover:text-blue-600 hover:bg-transparent"}>
                                            Dashboard
                                        </Button>
                                    </Link>
                                )}
                                {role === "patient" && (
                                    <Link to="/patient/doctors">
                                        <Button variant={isActive("/patient/doctors") ? "primary" : "outline"} size="sm" className={isActive("/patient/doctors") ? "" : "border-0 text-gray-600 hover:text-blue-600 hover:bg-transparent"}>
                                            Doctors
                                        </Button>
                                    </Link>
                                )}
                                {role === "patient" && (
                                    <Link to="/patient/trends">
                                        <Button variant={isActive("/patient/trends") ? "primary" : "outline"} size="sm" className={isActive("/patient/trends") ? "" : "border-0 text-gray-600 hover:text-blue-600 hover:bg-transparent"}>
                                            Trends
                                        </Button>
                                    </Link>
                                )}
                                {role === "doctor" && (
                                    <Link to="/doctor">
                                        <Button variant={isActive("/doctor") ? "primary" : "outline"} size="sm" className={isActive("/doctor") ? "" : "border-0 text-gray-600 hover:text-blue-600 hover:bg-transparent"}>
                                            Dashboard
                                        </Button>
                                    </Link>
                                )}
                                <div className="h-6 w-px bg-gray-200 mx-1"></div>
                                <ProfileDropdown />
                            </div>
                        )}
                    </nav>
                </div>
            </header>

            <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>

            <footer className="bg-white border-t border-gray-200 mt-auto">
                <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col items-center gap-3">
                    {/* Footer logo — hidden on auth pages */}
                    {!["/login", "/register"].includes(location.pathname) && (
                        <div className="flex items-center gap-2">
                            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <defs>
                                    <linearGradient id="footer-oyh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#1d3a8a" />
                                        <stop offset="100%" stopColor="#00d4aa" />
                                    </linearGradient>
                                </defs>
                                <path d="M50 5 L82 20 L82 52 C82 72 66 87 50 95 C34 87 18 72 18 52 L18 20 Z" fill="none" stroke="url(#footer-oyh-grad)" strokeWidth="5" strokeLinejoin="round" />
                                <path d="M22 68 Q50 80 78 68" fill="none" stroke="url(#footer-oyh-grad)" strokeWidth="5" strokeLinecap="round" />
                                <circle cx="45" cy="32" r="8" fill="url(#footer-oyh-grad)" />
                                <path d="M37 45 Q45 58 53 45 Q58 38 50 34" fill="url(#footer-oyh-grad)" />
                                <path d="M52 44 C52 40 56 37 60 40 C64 37 68 40 68 44 C68 51 60 57 60 57 C60 57 52 51 52 44 Z" fill="url(#footer-oyh-grad)" />
                                <path d="M52 48 L55 48 L57 43 L59 53 L61 43 L63 48 L68 48" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                <rect x="72" y="12" width="6" height="6" rx="1" fill="#00d4aa" />
                                <rect x="80" y="8" width="8" height="8" rx="1" fill="#00d4aa" />
                            </svg>
                            <span className="font-extrabold text-sm tracking-tight">
                                <span style={{ color: "#1d3a8a" }}>Own</span>
                                <span style={{ color: "#00b890" }}>Your</span>
                                <span style={{ color: "#1d3a8a" }}>Health</span>
                            </span>
                        </div>
                    )}
                    <p className="text-center text-xs text-gray-500">
                        © {new Date().getFullYear()} OwnYourHealth. Patient-Owned Digital Health Records.
                    </p>
                </div>
            </footer>
        </div>
    );
}
