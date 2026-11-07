// Service worker for the installed admin app (registered from /beheer only).
// Pages are never cached: they hold personal data and must always be fresh.
// Only when there is no connection at all does a navigation get the offline
// page, instead of the empty error screen of a home screen app.

const CACHE = "estasi-beheer-v2";
const OFFLINE = "/pwa/offline.html";
const PRECACHE = [OFFLINE];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Page loads only; forms, server actions, API calls and files go straight to the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE).then((page) => page || Response.error())));
});
