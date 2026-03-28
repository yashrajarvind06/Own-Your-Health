const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-error-401"));
    throw new Error("Unauthorized");
  }
  if (res.status === 403) {
    window.dispatchEvent(new Event("auth-error-403"));
    throw new Error("Forbidden");
  }

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiForm(path: string, form: FormData) {
  const token = localStorage.getItem("token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form, headers });

  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-error-401"));
    throw new Error("Unauthorized");
  }
  if (res.status === 403) {
    window.dispatchEvent(new Event("auth-error-403"));
    throw new Error("Forbidden");
  }

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addFamilyMember(data: { member_name: string; relationship: string; email: string; password: string }) {
  const resData = await api("/family/add-member", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!resData.success) throw new Error(resData.error || "Failed to add family member");
  return resData.data;
}

export async function listFamilyLinks() {
  const resData = await api("/family/list");
  if (!resData.success) throw new Error(resData.error || "Failed to list family members");
  return resData.data;
}

export async function listAccessedBy() {
  const resData = await api("/family/accessed-by");
  if (!resData.success) throw new Error(resData.error || "Failed to load access information");
  return resData.data;
}

export async function revokeFamilyLink(linkId: number) {
  const resData = await api(`/family/${linkId}`, {
    method: "DELETE",
  });
  if (!resData.success) throw new Error(resData.error || "Failed to revoke family link");
  return resData.data;
}
