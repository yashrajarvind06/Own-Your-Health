import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";

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

      navigate(res.role === "patient" ? "/patient" : "/doctor");
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)] gap-6">
      {/* Brand logo above the card */}
      <div className="flex flex-col items-center gap-1 select-none">
        <div className="flex items-center gap-3">
          <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="login-oyh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1d3a8a" />
                <stop offset="100%" stopColor="#00d4aa" />
              </linearGradient>
            </defs>
            <path d="M50 5 L82 20 L82 52 C82 72 66 87 50 95 C34 87 18 72 18 52 L18 20 Z" fill="none" stroke="url(#login-oyh-grad)" strokeWidth="5" strokeLinejoin="round" />
            <path d="M22 68 Q50 80 78 68" fill="none" stroke="url(#login-oyh-grad)" strokeWidth="5" strokeLinecap="round" />
            <circle cx="45" cy="32" r="8" fill="url(#login-oyh-grad)" />
            <path d="M37 45 Q45 58 53 45 Q58 38 50 34" fill="url(#login-oyh-grad)" />
            <path d="M52 44 C52 40 56 37 60 40 C64 37 68 40 68 44 C68 51 60 57 60 57 C60 57 52 51 52 44 Z" fill="url(#login-oyh-grad)" />
            <path d="M52 48 L55 48 L57 43 L59 53 L61 43 L63 48 L68 48" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <rect x="72" y="12" width="6" height="6" rx="1" fill="#00d4aa" />
            <rect x="80" y="8" width="8" height="8" rx="1" fill="#00d4aa" />
            <rect x="80" y="18" width="5" height="5" rx="1" fill="#1d3a8a" />
            <rect x="72" y="20" width="4" height="4" rx="1" fill="#00aacc" />
          </svg>
          <span className="font-extrabold text-3xl tracking-tight leading-none">
            <span style={{ color: "#1d3a8a" }}>Own</span>
            <span style={{ color: "#00b890" }}>Your</span>
            <span style={{ color: "#1d3a8a" }}>Health</span>
          </span>
        </div>
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#00b890" }}>Your Health • Your Control</p>
      </div>
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
