import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import DoctorCard from "../components/DoctorCard";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

type Doctor = {
  id: number;
  name: string;
  hpr_id: string;
  specialization: string;
  hospital: string;
  experience: number;
  qualification: string;
  verified: boolean;
};

type SearchResponse = {
  top_doctors: Doctor[];
  other_doctors: Doctor[];
};

export default function DoctorSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [topDoctors, setTopDoctors] = useState<Doctor[]>([]);
  const [otherDoctors, setOtherDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingDoctorId, setRequestingDoctorId] = useState<number | null>(null);
  const [requestedDoctorIds, setRequestedDoctorIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function fetchDoctors() {
      setLoading(true);
      setError(null);
      try {
        const qs = debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : "";
        const data = (await api(`/doctors/search${qs}`)) as SearchResponse;
        if (!cancelled) {
          setTopDoctors(Array.isArray(data.top_doctors) ? data.top_doctors : []);
          setOtherDoctors(Array.isArray(data.other_doctors) ? data.other_doctors : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to search doctors");
          setTopDoctors([]);
          setOtherDoctors([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDoctors();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const allSectionsEmpty = useMemo(
    () => topDoctors.length === 0 && otherDoctors.length === 0,
    [otherDoctors.length, topDoctors.length]
  );

  async function handleRequestAccess(doctorId: number) {
    try {
      setRequestingDoctorId(doctorId);
      await api("/access/request-direct", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId,
          reason: "FOLLOW_UP",
        }),
      });

      setRequestedDoctorIds((current) =>
        current.includes(doctorId) ? current : [...current, doctorId]
      );
      alert("Request sent to doctor");
    } catch (err: any) {
      alert(err.message || "Failed to send request");
    } finally {
      setRequestingDoctorId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card
        title="Search Doctors"
        description="Find HPR-verified doctors and request access through a trust-focused directory."
      >
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by doctor name"
        />
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Verified Doctors</h2>
          <p className="text-sm text-gray-500">HPR-registered doctors are prioritized to protect patient data.</p>
        </div>
        {topDoctors.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">
              {loading ? "Loading doctors..." : "No verified doctors found."}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {topDoctors.map((doctor) => (
              <DoctorCard
                key={`top-${doctor.id}`}
                doctor={doctor}
                onRequestAccess={handleRequestAccess}
                isLoading={requestingDoctorId === doctor.id}
                alreadyRequested={requestedDoctorIds.includes(doctor.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Restricted Doctors</h2>
          <p className="text-sm text-gray-500">Unverified profiles are visible for transparency but cannot request access.</p>
        </div>
        {otherDoctors.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">
              {loading && allSectionsEmpty ? "Loading doctors..." : "No restricted doctors found."}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {otherDoctors.map((doctor) => (
              <DoctorCard
                key={`other-${doctor.id}`}
                doctor={doctor}
                onRequestAccess={handleRequestAccess}
                isLoading={requestingDoctorId === doctor.id}
                alreadyRequested={requestedDoctorIds.includes(doctor.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
