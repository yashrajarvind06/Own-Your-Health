import React, { useEffect, useState } from "react";
import FamilyCard from "../components/FamilyCard";
import { addFamilyMember, listAccessedBy, listFamilyLinks, revokeFamilyLink } from "../api";

interface FamilyLink {
  id: number;
  owner_user_id: number;
  owner_email?: string | null;
  owner_name?: string | null;
  target_user_id: number;
  target_email?: string | null;
  target_name?: string | null;
  relationship: string;
  member_email: string;
  status: string;
  created_at: string;
  verified_at?: string | null;
}

const emptyForm = {
  member_name: "",
  relationship: "",
  email: "",
  password: "",
};

const FamilyPage: React.FC = () => {
  const [outgoingLinks, setOutgoingLinks] = useState<FamilyLink[]>([]);
  const [incomingLinks, setIncomingLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [outgoing, incoming] = await Promise.all([
        listFamilyLinks(),
        listAccessedBy(),
      ]);
      setOutgoingLinks(Array.isArray(outgoing) ? outgoing : []);
      setIncomingLinks(Array.isArray(incoming) ? incoming : []);
    } catch (err: any) {
      setError(err.message || "Failed to load family mode");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitMessage(null);
    setSubmitting(true);

    try {
      const result = await addFamilyMember(formData);
      setSubmitMessage(
        result.created_account
          ? "Family member account created and linked successfully."
          : "Family member linked successfully."
      );
      setFormData(emptyForm);
      setShowForm(false);
      await loadData();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to add family member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (linkId: number) => {
    try {
      await revokeFamilyLink(linkId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to remove family member");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Family Mode</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a real patient account using their email and password. Access stays one-way from your side.
          </p>
        </div>

        <button
          onClick={() => {
            setShowForm(!showForm);
            setSubmitError(null);
            setSubmitMessage(null);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "Add Family Member"}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-xl font-bold">Add Family Member</h2>
          <p className="text-sm text-gray-500">
            Use the family member&apos;s patient email and password. If their account does not exist yet, this will create it and then link it to you.
          </p>

          {submitError && (
            <div className="text-red-600 bg-red-50 p-3 rounded border border-red-100">
              {submitError}
            </div>
          )}

          <form onSubmit={handleAddMember} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              required
              type="text"
              value={formData.member_name}
              onChange={e => setFormData({ ...formData, member_name: e.target.value })}
              className="w-full p-3 border rounded-lg"
              placeholder="Member name"
            />
            <input
              required
              type="text"
              value={formData.relationship}
              onChange={e => setFormData({ ...formData, relationship: e.target.value })}
              className="w-full p-3 border rounded-lg"
              placeholder="Relationship"
            />
            <input
              required
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full p-3 border rounded-lg md:col-span-2"
              placeholder="Member email"
            />
            <input
              required
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="w-full p-3 border rounded-lg md:col-span-2"
              placeholder="Member password"
            />
            <div className="md:col-span-2 flex justify-end">
              <button
                disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-70"
              >
                {submitting ? "Adding..." : "Save Member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {submitMessage && (
        <div className="text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
          {submitMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading family mode...</div>
      ) : error ? (
        <div className="text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">{error}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Members I Can Access</h2>
              <p className="text-sm text-gray-500 mt-1">
                These patient accounts are linked from your profile and available in the switcher.
              </p>
            </div>

            {outgoingLinks.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl p-6 text-sm text-gray-500">
                No linked family members yet.
              </div>
            ) : (
              outgoingLinks.map(link => (
                <FamilyCard
                  key={link.id}
                  item={link}
                  variant="outgoing"
                  actionLabel="Remove"
                  onAction={() => handleRevoke(link.id)}
                />
              ))
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Managed By</h2>
              <p className="text-sm text-gray-500 mt-1">
                These patient accounts can access your profile. This list is informational only.
              </p>
            </div>

            {incomingLinks.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl p-6 text-sm text-gray-500">
                This profile is not managed by anyone yet.
              </div>
            ) : (
              incomingLinks.map(link => (
                <FamilyCard
                  key={link.id}
                  item={link}
                  variant="incoming"
                />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default FamilyPage;
