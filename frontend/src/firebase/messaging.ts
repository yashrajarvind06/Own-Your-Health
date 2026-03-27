// src/firebase/messaging.ts
// Firebase Cloud Messaging helpers.
// Call requestNotificationPermission() after user login to get an FCM token.

import { getToken, onMessage, MessagePayload } from "firebase/messaging";
import { getMessagingInstance } from "./firebaseConfig";

// ---------------------------------------------------------------------------
// VAPID key — from Firebase Console → Project Settings → Cloud Messaging
// ---------------------------------------------------------------------------
const VAPID_KEY =
  "BKJye-ULGy2_9vGHiPNoGxNdQrjzGkyzOb5LEpykap0Ahsof2Ua1knZ1Mriyv4FwSCZpSSVEoDcgNJA3-Tvr8TY";

/**
 * Requests notification permission from the user.
 * If granted, generates and returns the FCM registration token.
 * Returns null if permission is denied or messaging is unsupported.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("FCM: Notification permission denied.");
      return null;
    }

    const messagingInstance = await getMessagingInstance();
    if (!messagingInstance) {
      console.warn("FCM: Messaging not supported in this browser.");
      return null;
    }

    // The service worker must be registered first (it lives in /public)
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log("FCM Token:", token);
      // TODO: Send this token to your backend to store it per user
      localStorage.setItem("fcm_token", token);
      return token;
    } else {
      console.warn("FCM: No registration token available.");
      return null;
    }
  } catch (error) {
    console.error("FCM: Error requesting permission or getting token:", error);
    return null;
  }
}

/**
 * Listens for foreground push messages.
 * @param callback - receives the MessagePayload when a message arrives
 * @returns an unsubscribe function
 */
export async function onForegroundMessage(
  callback: (payload: MessagePayload) => void
): Promise<(() => void) | null> {
  const messagingInstance = await getMessagingInstance();
  if (!messagingInstance) return null;

  // onMessage returns an unsubscribe function
  const unsubscribe = onMessage(messagingInstance, (payload) => {
    console.log("FCM: Foreground message received:", payload);
    callback(payload);
  });

  return unsubscribe;
}
