import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "../api";

interface User {
    id: number;
    email: string;
    role: "patient" | "doctor" | "lab";
    display_name?: string | null;
    name?: string | null;
    verified?: boolean;
    hpr_id?: string | null;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (token: string, userData: User) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = async () => {
        try {
            console.log("Auth: Fetching user profile...");
            // Add simple timeout to avoid infinite loading
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
            // Use /user/me/profile to get display_name as well
            const apiPromise = api("/user/me/profile");
            const data = await Promise.race([apiPromise, timeoutPromise]);

            console.log("Auth: User profile loaded", data);
            setUser(data);
        } catch (e) {
            console.error("Failed to fetch user profile", e);
            localStorage.removeItem("token");
            setUser(null);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            console.log("Auth: Token found, initializing...");
            fetchUser().finally(() => {
                console.log("Auth: Loading finished");
                setLoading(false);
            });
        } else {
            console.log("Auth: No token, loading finished");
            setLoading(false);
        }

        // Listen for custom auth events from legacy Login/Register calls
        const handleAuthChange = () => {
            const t = localStorage.getItem("token");
            if (t) fetchUser();
            else setUser(null);
        };

        const handleAuthError401 = () => {
            console.warn("Auth: 401 Unauthorized - logging out");
            logout();
        };

        const handleAuthError403 = () => {
            console.warn("Auth: 403 Forbidden");
            alert("Access Denied: You do not have permission to view this resource.");
        };

        window.addEventListener("auth-change", handleAuthChange);
        window.addEventListener("auth-error-401", handleAuthError401);
        window.addEventListener("auth-error-403", handleAuthError403);

        return () => {
            window.removeEventListener("auth-change", handleAuthChange);
            window.removeEventListener("auth-error-401", handleAuthError401);
            window.removeEventListener("auth-error-403", handleAuthError403);
        };
    }, []);

    const login = (token: string, userData: User) => {
        localStorage.setItem("token", token);
        localStorage.setItem("role", userData.role);
        // Important: ensure user_id is string
        localStorage.setItem("user_id", String(userData.id));

        setUser(userData);
        // Dispatch event so other tabs/components know
        window.dispatchEvent(new Event("auth-change"));
    };

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        localStorage.removeItem("user_id");
        // Clear session storage (critical for QR token cleanup)
        sessionStorage.clear();
        setUser(null);
        window.dispatchEvent(new Event("auth-change"));
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
