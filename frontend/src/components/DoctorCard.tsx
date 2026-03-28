import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

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

interface DoctorCardProps {
  doctor: Doctor;
  onRequestAccess: (doctorId: number) => void;
  isLoading?: boolean;
  alreadyRequested?: boolean;
}

export default function DoctorCard({
  doctor,
  onRequestAccess,
  isLoading = false,
  alreadyRequested = false,
}: DoctorCardProps) {
  const accessDisabled = isLoading || alreadyRequested || !doctor.verified;

  return (
    <Card className={`border ${doctor.verified ? "border-emerald-100" : "border-amber-100"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">
            {doctor.name}
          </h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p>{doctor.specialization}</p>
            <p>{doctor.hospital}</p>
            <p>{doctor.experience} years experience</p>
            <p>{doctor.qualification}</p>
          </div>
          <div
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              doctor.verified
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {doctor.verified ? "Verified (HPR Registered)" : "Not Verified"}
          </div>
          {!doctor.verified && (
            <p className="text-sm text-amber-700">
              Only HPR-verified doctors can request access
            </p>
          )}
        </div>
        <Button
          onClick={() => onRequestAccess(doctor.id)}
          isLoading={isLoading}
          disabled={accessDisabled}
          className="sm:min-w-[160px]"
        >
          {alreadyRequested ? "Request Pending" : "Request Access"}
        </Button>
      </div>
    </Card>
  );
}
