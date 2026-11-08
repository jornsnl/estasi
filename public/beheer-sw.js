// Service worker for the installed admin app (registered from /beheer), also
// used for the push notifications of the Academy community (see the end).
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

// Push notifications of the Academy community and private messages
// (src/lib/community/push.ts). Students register this same worker when they
// turn notifications on: one worker per site, shared by admin and students.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Wedding Plan Academy", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/pwa/beheer-192.png",
      badge: "/pwa/beheer-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  // Only pages of this app.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client && "navigate" in client) return client.navigate(url).then((c) => (c || client).focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
