import { Platform } from "react-native";

// Web (installed PWA): the backend serves the app, so the API is the page's own origin (works behind any HTTPS URL).
// Web on the Metro dev server (port 8081): the backend is on the same machine at port 8000.
// Native: localhost is the phone itself, so set EXPO_PUBLIC_API_BASE to your PC's LAN IP (see mobile/.env.example).
export const API_BASE = Platform.OS === "web"
  // Cloudflare Pages build: the backend lives elsewhere (scripts/deploy-demo.ps1 sets this)
  ? process.env.EXPO_PUBLIC_WEB_API_BASE || (window.location.port === "8081" ? `http://${window.location.hostname}:8000` : window.location.origin)
  : process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

/** Report links are relative signed paths when stored locally, absolute when on S3. */
export const absoluteUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE}${url}`);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      // FormData sets its own multipart boundary
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // FastAPI sends a string for HTTPException and a list of field errors for validation failures
    const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.[0]?.msg;
    throw new ApiError(res.status, detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}
