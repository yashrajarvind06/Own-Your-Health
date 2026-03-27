// src/services/notifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// Notification service — wraps Firebase Messaging.
// ─────────────────────────────────────────────────────────────────────────────

import { requestNotificationPermission, onForegroundMessage } from "../firebase/messaging";

type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
};

// ─── Internal: Show an in-app toast notification ─────────────────────────────
function showInAppToast(title: string, body: string, type: "info" | "success" | "warning" | "danger" = "info") {
  const toast = document.createElement("div");

  const colours = {
    info:    "border-blue-400 bg-blue-50 text-blue-900",
    success: "border-green-400 bg-green-50 text-green-900",
    warning: "border-yellow-400 bg-yellow-50 text-yellow-900",
    danger:  "border-red-500 bg-red-50 text-red-900",
  };

  toast.className =
    `fixed top-4 right-4 z-[99999] max-w-sm w-full shadow-xl border-l-4 rounded-lg px-4 py-3 ` +
    `transition-all duration-300 animate-in slide-in-from-right ${colours[type]}`;

  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="flex-1">
        <p class="font-semibold text-sm">${title}</p>
        <p class="text-xs mt-0.5 opacity-80">${body}</p>
      </div>
      <button class="text-current opacity-50 hover:opacity-100 text-lg leading-none" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// ─── Internal: Event-Based Deduplication ────────────────────────────────────
const lastEvents: Record<string, number> = {};

export const shouldNotify = (event: string) => {
  const now = Date.now();
  if (lastEvents[event] && now - lastEvents[event] < 10000) {
    return false;
  }
  
  lastEvents[event] = now;
  // Prevent memory leaks / infinite map growth over time
  setTimeout(() => {
    delete lastEvents[event];
  }, 10000);

  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function notifyAccessRequested(patientId: number) {
  if (!shouldNotify("ACCESS_REQUESTED")) return;
  console.log("[Notify Triggered]: Access Request Sent");
  
  try {
    showInAppToast(
      "Access Request Sent",
      "Waiting for patient approval. You'll be notified when they respond.",
      "info"
    );
  } catch (err) {
    // Fallback if DOM manipulation fails
    console.warn("Failed to render native toast, action successful naturally.");
  }
}

export function notifyAccessApproved(requestId: number) {
  if (!shouldNotify("ACCESS_APPROVED")) return;
  console.log("[Notify Triggered]: Access Approved");
  
  try {
    showInAppToast(
      "Access Approved ✅",
      "You've granted the doctor access to your records.",
      "success"
    );
  } catch (err) { }
}

export function notifyAccessDenied(requestId: number) {
  if (!shouldNotify("ACCESS_DENIED")) return;
  console.log("[Notify Triggered]: Access Denied");
  
  try {
    showInAppToast(
      "Access Denied",
      "You've denied the doctor's access request.",
      "warning"
    );
  } catch (err) { }
}

export function notifyEmergencyOverride(patientId: number) {
  if (!shouldNotify("EMERGENCY_OVERRIDE")) return;
  console.log("[Notify Triggered]: Emergency Override Activated");
  
  try {
    showInAppToast(
      "🚨 Emergency Override Activated",
      "Break-glass access has been logged as a critical security event.",
      "danger"
    );
  } catch (err) { }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialiser
// ─────────────────────────────────────────────────────────────────────────────

let listenerInitialised = false;
let permissionRequested = false;

export async function initNotifications() {
  if (listenerInitialised) return;
  listenerInitialised = true;

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "denied") {
      console.warn("[Notify] Notifications permission is denied by user.");
      return;
    }
    // Explicitly request if "default" (unprompted)
    if (Notification.permission === "default") {
      if (permissionRequested) return;
      permissionRequested = true;
      try {
        await Notification.requestPermission();
      } catch (e) {
        console.warn("[Notify] Failed to request permission:", e);
      }
    }
  }

  try {
    const token = await requestNotificationPermission();
    if (!token) return;

    await onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? "OwnYourHealth";
      const body = payload.notification?.body ?? "You have a new notification.";

      const data = payload.data ?? {};
      const type = data.type as "info" | "success" | "warning" | "danger" | undefined;
      showInAppToast(title, body, type ?? "info");
    });
  } catch (err) {
    console.warn("FCM initialisation failed gracefully:", err);
  }
}
