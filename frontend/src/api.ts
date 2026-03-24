const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  console.log("DEBUG API: Token for", path, "is", token ? "Present" : "MISSING");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers || {}),
  };
  console.log("DEBUG API: Fetching", path, "Headers:", JSON.stringify(headers));
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
