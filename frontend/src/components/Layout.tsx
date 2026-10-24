import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/Button";
import ProfileDropdown from "./ProfileDropdown";
import { LogoMark, Wordmark } from "./OwnYourHealthLogo";

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const location = useLocation();

    // Role is derived from user object now
    const role = user?.role;

    const isActive = (path: string) => location.pathname === path;

    // The doctor workspace draws its own full-window shell
    if (location.pathname === "/doctor") return <>{children}</>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 group">
                        <LogoMark size={36} className="transition-transform duration-200 group-hover:scale-105" />
                        <Wordmark className="text-xl" />
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
                            <LogoMark size={28} />
                            <Wordmark className="text-sm" />
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
