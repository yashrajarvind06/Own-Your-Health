// src/firebase/firebaseConfig.ts
// Central Firebase initialization — uses Firebase Modular SDK (v10+).

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";

// ---------------------------------------------------------------------------
// Firebase project configuration
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCyO47mCKfOU0PWRpmj5dikhqNPesRcGkY",
  authDomain: "team-pheonix-7d039.firebaseapp.com",
  projectId: "team-pheonix-7d039",
  storageBucket: "team-pheonix-7d039.appspot.com",
  messagingSenderId: "936473906536",
  appId: "1:936473906536:web:cf03d1a21b56a71242dadd",
};

const app = initializeApp(firebaseConfig);

// Firebase Authentication instance
const auth = getAuth(app);

// Lazy Messaging instance (not supported in all browsers/environments)
let messagingInstance: Messaging | null = null;

/**
 * Returns the FCM Messaging instance, or null if unsupported.
 */
export async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported();
  if (supported) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

export { auth };
export default app;
