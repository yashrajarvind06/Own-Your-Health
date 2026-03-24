import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import QRBadge from "../components/QRBadge";
import { ActiveSessionsList } from "../components/ActiveSessionsList";
import ScanQR from "./ScanQR"; // Helper Component

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null); // Track selected session

  const handleSessionSelect = (session: any) => {
    setPatientId(session.patient_id);
    setActiveSession(session);
  };

  const handleSessionEnd = () => {
    setPatientId(null);
    setActiveSession(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Doctor Workstation</h1>
      </div>

      <div className="space-y-8">
        {/* 1. TOP PRIORITY: Active Sessions (Full Width) */}
        <ActiveSessionsList onSelect={handleSessionSelect} onSessionEnd={handleSessionEnd} currentPatientId={patientId} />

        {/* 2. PATIENT ACCESS TERMINAL */}
        <ScanQR initialPatientId={patientId} />

      </div>
    </div>
  );
}
