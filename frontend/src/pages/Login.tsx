import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { PATIENT_APP_URL } from "../components/PatientAppMoved";
import OwnYourHealthLogo from "../components/OwnYourHealthLogo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      // Use context login method
      login(res.access_token, {
        id: res.user_id,
        email, // We might not get email back, but we have it here. Or we can rely on fetchUser later.
        role: res.role
      });

      if (res.role === "patient") return window.location.assign(PATIENT_APP_URL); // patients use the patient app
      navigate(({ doctor: "/doctor", lab: "/lab" } as Record<string, string>)[res.role] ?? "/");
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)] gap-6">
      {/* Brand logo above the card */}
      <OwnYourHealthLogo size="lg" showTagline className="select-none" />
      <Card className="w-full max-w-md" title="Welcome Back">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

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
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button className="w-full" size="lg" isLoading={loading}>
            Sign In
          </Button>

          <p className="text-center text-sm text-gray-600 mt-4">
            Don't have an account?{" "}
            <Link to="/register" className="text-blue-600 hover:text-blue-500 font-medium">
              Create one
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
