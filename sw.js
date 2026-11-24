const CACHE_NAME = "laundysync-v5-offline-local";
const APP_FILES = [
  "./", "./index.html", "./style.css", "./app.js", "./backend.js",
  "./config.js", "./manifest.json"
];
const LIBRARY_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;
  const library = LIBRARY_HOSTS.includes(url.hostname);
  if (!local && !library) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // Config changes should be fetched when online, with the last known copy
    // available during an outage.
    if (local && url.pathname.endsWith("/config.js")) {
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    }

    // Cached application files and libraries keep the shell usable offline.
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (local) {
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
