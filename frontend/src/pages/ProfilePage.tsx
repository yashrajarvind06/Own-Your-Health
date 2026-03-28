import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, listAccessedBy } from "../api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";

interface UserProfile {
  id: number;
  display_name: string | null;
  email: string;
  role: string;
}

interface IncomingAccessLink {
  id: number;
  owner_email?: string | null;
  owner_name?: string | null;
  relationship: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [managedBy, setManagedBy] = useState<IncomingAccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const { logout } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [userData, incomingLinks] = await Promise.all([
        api("/user/me/profile"),
        listAccessedBy().catch(() => []),
      ]);
      setUser(userData);
      setEditName(userData.display_name || "");
      setManagedBy(Array.isArray(incomingLinks) ? incomingLinks : []);
    } catch (err) {
      setError("Unable to load profile information");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveName() {
    if (!editName.trim()) return;

    setSavingName(true);
    setNameMessage("");
    try {
      await api("/user/me/display-name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: editName.trim() }),
      });
      setUser(prev => prev ? { ...prev, display_name: editName.trim() } : null);
      setNameMessage("Display name updated successfully");
      setTimeout(() => setNameMessage(""), 3000);
    } catch (err: any) {
      setNameMessage("Error: " + err.message);
    } finally {
      setSavingName(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading profile...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!user) return <div className="p-8 text-center">User not found.</div>;

  const isDoctor = user.role === "doctor";
  const dashboardPath = isDoctor ? "/doctor" : "/patient";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account identity and see who can access this profile.
          </p>
        </div>
        <Link to={dashboardPath} className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Back to dashboard
        </Link>
      </div>

      {!isDoctor && managedBy.length > 0 && (
        <Card title="Managed By" description="These patient accounts can access this profile from Family Mode.">
          <div className="space-y-3">
            {managedBy.map((link) => (
              <div key={link.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">
                  Managed by {link.owner_name || link.owner_email}
                </p>
                <p className="text-sm text-emerald-700 mt-1">{link.owner_email}</p>
                <p className="text-xs text-emerald-700 mt-2 uppercase tracking-wide">{link.relationship}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title="Account Identity" description="Basic information used across the system.">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                <div className="flex gap-3">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your display name"
                  />
                  <Button
                    onClick={handleSaveName}
                    disabled={savingName || !editName.trim() || editName === (user.display_name || "")}
                  >
                    {savingName ? "Saving..." : "Save"}
                  </Button>
                </div>
                {nameMessage && <p className="text-sm text-green-600 mt-2">{nameMessage}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <Input value={user.email} readOnly disabled className="bg-gray-50 text-gray-600" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <div className="flex items-center h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 capitalize">
                  {user.role}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Quick Links">
            <div className="space-y-3 text-sm">
              {!isDoctor && (
                <Link to="/family" className="block rounded-lg border border-gray-200 px-4 py-3 hover:border-blue-300 hover:bg-blue-50">
                  Family Mode
                </Link>
              )}
              <Link to={dashboardPath} className="block rounded-lg border border-gray-200 px-4 py-3 hover:border-blue-300 hover:bg-blue-50">
                Dashboard
              </Link>
            </div>
          </Card>

          <Card title="Session">
            <Button variant="outline" className="w-full" onClick={logout}>
              Logout
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
