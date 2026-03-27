// public/firebase-messaging-sw.js
// Firebase Cloud Messaging Service Worker.
// This file MUST live in /public so it is served from the root: /firebase-messaging-sw.js
// It handles background push notifications when the browser tab is not focused.
//
// NOTE: Service workers cannot use ES6 import statements — we use importScripts() here.

// ---------------------------------------------------------------------------
// Import Firebase compat scripts (required for service worker environment)
// ---------------------------------------------------------------------------
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ---------------------------------------------------------------------------
// Firebase config (must match firebaseConfig.ts — no env vars in SW possible)
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCyO47mCKfOU0PWRpmj5dikhqNPesRcGkY",
  authDomain: "team-pheonix-7d039.firebaseapp.com",
  projectId: "team-pheonix-7d039",
  storageBucket: "team-pheonix-7d039.appspot.com",
  messagingSenderId: "936473906536",
  appId: "1:936473906536:web:cf03d1a21b56a71242dadd",
};

// Initialise Firebase inside the service worker
firebase.initializeApp(firebaseConfig);

// Get the messaging instance
const messaging = firebase.messaging();

// ---------------------------------------------------------------------------
// Background message handler
// This fires when a push arrives while the app tab is NOT focused.
// ---------------------------------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const notificationTitle =
    payload.notification?.title || "OwnYourHealth Notification";
  const notificationOptions = {
    body: payload.notification?.body || "You have a new notification.",
    icon: "/favicon.ico", // place your app icon here
    badge: "/favicon.ico",
    data: payload.data || {},
  };

  // Show the notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ---------------------------------------------------------------------------
// Handle notification click — focuses / opens the app tab
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If an app tab is already open, focus it
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
