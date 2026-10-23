// OwnYourHealth service worker: offline app shell + emergency QR image.
// Network-first, so a new deploy is picked up on the next online load (no stale-cache trap).
// Health data is never cached here; the emergency card's details live in the app's own storage.
const CACHE = "oyh-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (url, request) =>
  request.mode === "navigate" ||
  url.pathname.startsWith("/_expo/") ||
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/api/emergency-qr/qr/") ||
  /^\/(manifest\.json|favicon\.ico|icon-\d+\.png)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || !cacheable(url, event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          // every app route is the same single-page shell, so store navigations under "/"
          caches.open(CACHE).then((c) => c.put(event.request.mode === "navigate" ? "/" : event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request.mode === "navigate" ? "/" : event.request)),
  );
});
