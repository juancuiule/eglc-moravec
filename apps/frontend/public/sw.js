// Moravec offline app shell — hand-rolled, no workbox. Registered from the
// boot component (production + secure contexts only).
//
// Strategy:
//   - /_next/static/* and public assets: cache-first. Content-hashed, so
//     forever-safe; old entries die when the versioned cache name changes.
//   - Navigations: network-first → per-URL cached document (a previously
//     visited page replays verbatim, server props and all) → the cached
//     /offline app-shell document, whose client code routes by
//     location.pathname.
//   - /api/* (and anything non-GET or cross-origin): never touched — sync
//     calls must hit the network or fail honestly, not be answered stale.
//   - RSC/prefetch fetches are network-only too: a failed soft navigation
//     escalates to a hard navigation, which this handler then serves.
//
// Bump VERSION when the caching rules change so activate drops stale caches.
const VERSION = "v1";
const STATIC_CACHE = `moravec-static-${VERSION}`;
const PAGE_CACHE = `moravec-pages-${VERSION}`;
const SHELL_URL = "/offline";
const STATIC_PATHS = ["/moravec.svg", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== STATIC_CACHE && n !== PAGE_CACHE)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The SW script itself and all sync/API traffic bypass the cache.
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    STATIC_PATHS.includes(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function navigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match(SHELL_URL);
    return shell ?? Response.error();
  }
}
