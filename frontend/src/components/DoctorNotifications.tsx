import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

type IncomingRequest = {
  id: number;
  patient_id: number;
  patient_name: string;
  reason: string;
  created_at: string | null;
};

export default function DoctorNotifications({ onActionComplete }: { onActionComplete?: () => void }) {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loadingRequestId, setLoadingRequestId] = useState<number | null>(null);

  async function loadRequests() {
    try {
      const data = await api("/access/requests/incoming");
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load direct requests", error);
    }
  }

  useEffect(() => {
    loadRequests();
    const interval = window.setInterval(loadRequests, 5000);
    return () => window.clearInterval(interval);
  }, []);

  async function handleDecision(requestId: number, decision: "APPROVED" | "DENIED") {
    try {
      setLoadingRequestId(requestId);
      await api("/access/request-direct/respond", {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId,
          decision,
          duration: "15m",
        }),
      });
      await loadRequests();
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (error: any) {
      alert(error.message || "Failed to update request");
    } finally {
      setLoadingRequestId(null);
    }
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card title="Notifications" className="border-t-4 border-t-amber-500">
      <div className="space-y-3">
        {requests.map((request) => (
          <div
            key={request.id}
            className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-gray-900">
                  {request.patient_name} requested direct access approval
                </div>
                <div className="mt-1 text-sm text-gray-600">Reason: {request.reason}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {request.created_at ? new Date(request.created_at).toLocaleString() : "Just now"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={loadingRequestId === request.id}
                  onClick={() => handleDecision(request.id, "DENIED")}
                >
                  Deny
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  isLoading={loadingRequestId === request.id}
                  onClick={() => handleDecision(request.id, "APPROVED")}
                >
                  Approve
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
