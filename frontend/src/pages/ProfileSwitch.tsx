import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";

interface Profile {
  id: number;
  switch_target_id: number | null;
  name: string;
  email?: string | null;
  relationship: string;
  profile_mode: "self" | "linked" | "return";
  is_active: boolean;
}

const ProfileSwitch: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const currentProfile = profiles.find((profile) => profile.is_active) || null;
  const switchTargets = profiles.filter((profile) => !profile.is_active);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api("/profiles/");
      if (Array.isArray(res?.data)) {
        setProfiles(res.data);
      } else {
        setProfiles([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (targetId: number | null) => {
    if (!targetId) return;

    try {
      const res = await api(`/profiles/switch/${targetId}`, { method: "POST" });
      const nextToken = res?.data?.access_token;

      if (nextToken) {
        sessionStorage.clear();
        localStorage.setItem("token", nextToken);
        localStorage.removeItem("role");
        localStorage.removeItem("user_id");
        window.dispatchEvent(new Event("auth-change"));
        window.location.href = "/patient";
      }
    } catch (err: any) {
      alert("Failed to switch profile: " + (err.message || "Unknown error"));
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Link to="/patient" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900">Switch Profile</h1>
        </div>
        <p className="text-gray-500 mt-2 ml-9">Choose your own profile or a directly linked family member.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="text-center py-10 text-red-500 bg-red-50 rounded-xl border border-red-100">{error}</div>
      ) : (
        <div className="space-y-8">
          {currentProfile && (
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Current Profile</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold bg-blue-100 text-blue-700">
                  {currentProfile.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{currentProfile.name}</h3>
                  <p className="text-sm text-gray-500 truncate">{currentProfile.email}</p>
                </div>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">
                  Active
                </span>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-4">Switch Accounts</p>
            {switchTargets.length === 0 ? (
              <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
                No linked profiles available to switch into.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {switchTargets.map((profile) => (
            <div
              key={`${profile.id}-${profile.relationship}`}
              className={`bg-white rounded-xl shadow border p-5 transition-all ${
                profile.switch_target_id
                  ? "border-blue-100 hover:shadow-md hover:border-blue-300"
                  : "border-gray-100 opacity-70"
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
                  "bg-green-100 text-green-700"
                }`}>
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{profile.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-600">
                    {profile.profile_mode === "return" ? "Return" : profile.relationship}
                  </span>
                  <p className="text-xs text-gray-500 mt-1 truncate">{profile.email || "Linked family profile"}</p>
                </div>
              </div>

              <button
                onClick={() => handleSwitch(profile.switch_target_id)}
                className="w-full py-2 rounded-lg font-medium transition bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                Switch
              </button>
            </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSwitch;
