/// <reference types="vite/client" />
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Friendly error messages for common HTTP status codes
// ---------------------------------------------------------------------------
function friendlyError(status: number, raw: string): string {
  const map: Record<number, string> = {
    400: "Bad request — please check your input.",
    404: "Resource not found.",
    409: "Conflict — this action has already been performed.",
    422: "Validation error — some fields are invalid.",
    429: "Too many requests. Please wait a moment and try again.",
    500: "Server error. Please try again shortly.",
    502: "Server is temporarily unavailable.",
    503: "Service unavailable. Please try again later.",
  };
  return map[status] || "Something went wrong. Please try again later.";
}

// ---------------------------------------------------------------------------
// Idempotency protection: DO NOT retry these modifying endpoints
// ---------------------------------------------------------------------------
const NON_RETRY_ENDPOINTS = [
  "/access/approve",
  "/access/deny",
  "/emergency/override",
  "/access/request-v2",
  "/qr/generate",
];

// ---------------------------------------------------------------------------
// Core fetch wrapper with 1 automatic retry on network failure or 5xx
// (Never retries on 4xx) + AbortController timeout
// ---------------------------------------------------------------------------
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  // Offline fast-fail
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No internet connection.");
  }

  const isNonRetryable = NON_RETRY_ENDPOINTS.some((ep) => url.includes(ep));
  const effectiveRetries = isNonRetryable ? 0 : retries;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    // Retry on 5xx server errors only
    if (res.status >= 500 && effectiveRetries > 0) {
      console.warn(`API: Server error ${res.status}, retrying (${effectiveRetries} left)…`);
      const delay = 500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, effectiveRetries - 1);
    }
    return res;
  } catch (networkError: any) {
    clearTimeout(timeoutId);

    if (networkError.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }

    // Retry on network failure (offline, timeout, CORS, etc.)
    if (effectiveRetries > 0) {
      console.warn("API: Network error, retrying…", networkError);
      const delay = 500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, effectiveRetries - 1);
    }
    throw new Error("Network error — please check your connection.");
  }
}

// ---------------------------------------------------------------------------
// Main API function — use this for all JSON calls
// ---------------------------------------------------------------------------
export async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  console.log("API:", path, token ? "(authenticated)" : "(no token)");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers || {}),
  };

  const res = await fetchWithRetry(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-error-401"));
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 403) {
    window.dispatchEvent(new Event("auth-error-403"));
    throw new Error("Access denied. You don't have permission for this action.");
  }

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(friendlyError(res.status, raw));
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Form/file upload variant (multipart)
// ---------------------------------------------------------------------------
export async function apiForm(path: string, form: FormData) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    headers,
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-error-401"));
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 403) {
    window.dispatchEvent(new Event("auth-error-403"));
    throw new Error("Access denied. You don't have permission for this action.");
  }

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(friendlyError(res.status, raw));
  }

  return res.json();
}

