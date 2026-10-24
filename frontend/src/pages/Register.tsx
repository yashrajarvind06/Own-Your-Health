import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { PATIENT_APP_URL } from "../components/PatientAppMoved";
import OwnYourHealthLogo from "../components/OwnYourHealthLogo";

export default function Register() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"patient" | "doctor" | "lab">("patient");
  const [registryId, setRegistryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, role, display_name: displayName, registry_id: role === "patient" ? undefined : registryId }),
      });
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("user_id", String(res.user_id));

      // Dispatch custom event to update Layout
      window.dispatchEvent(new Event("auth-change"));

      if (res.role === "patient") return window.location.assign(PATIENT_APP_URL); // patients use the patient app
      navigate(({ doctor: "/doctor", lab: "/lab" } as Record<string, string>)[res.role] ?? "/");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)] gap-6">
      {/* Brand logo above the card */}
      <OwnYourHealthLogo size="lg" showTagline className="select-none" />
      <Card className="w-full max-w-md" title="Create an Account">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <Input
            label="Full Name"
            type="text"
            placeholder="John Doe"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            placeholder="Create a strong password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              I am a...
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`flex items-center justify-center px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${role === 'patient' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setRole('patient')}
              >
                Patient
              </button>
              <button
                type="button"
                className={`flex items-center justify-center px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${role === 'doctor' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setRole('doctor')}
              >
                Doctor
              </button>
              <button
                type="button"
                className={`flex items-center justify-center px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${role === 'lab' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setRole('lab')}
              >
                Lab
              </button>
            </div>
          </div>

          {role !== "patient" && (
            <Input
              label={role === "doctor" ? "HPR Registration Number" : "HFR Facility ID"}
              type="text"
              placeholder={role === "doctor" ? "HPR1234567890" : "HFR1000000001"}
              value={registryId}
              onChange={e => setRegistryId(e.target.value)}
              required
            />
          )}

          <Button className="w-full" size="lg" isLoading={loading}>
            Create Account
          </Button>

          <p className="text-center text-sm text-gray-600 mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
