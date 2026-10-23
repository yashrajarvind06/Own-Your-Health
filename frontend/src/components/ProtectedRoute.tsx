import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: JSX.Element;
    allowedRoles?: string[]; // Optional: if omitted, just checks login
    requireVerified?: boolean; // doctor/lab pages whose API calls need an HPR/HFR-verified account
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requireVerified }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // If logged in but wrong role, redirect to their dashboard
        return <Navigate to={({ patient: "/patient", doctor: "/doctor", lab: "/lab" } as Record<string, string>)[user.role] ?? '/'} replace />;
    }

    // Without this the page would load and every API call would come back 403 (Access Denied popups)
    if (requireVerified && !user.verified) {
        const registry = user.role === "lab" ? "HFR" : "HPR";
        return (
            <div className="mx-auto max-w-lg py-16 text-center">
                <h2 className="text-xl font-bold text-gray-900">Verify your {registry} ID first</h2>
                <p className="mt-2 text-gray-600">This page shows patient-related data, so it's only available to {registry}-verified accounts.</p>
                <Link to={user.role === "lab" ? "/profile" : "/doctor"} className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">
                    Verify now
                </Link>
            </div>
        );
    }

    return children;
};

export default ProtectedRoute;
