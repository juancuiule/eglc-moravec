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
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

// The shell document alone isn't enough — its page chunk and shared bundles
// are separate requests that a cold offline navigation would fail to load.
// Parse the HTML and precache every /_next/static asset it references; if any
// of them fail the install fails too, and the next visit retries it whole.
async function installShell() {
  const response = await fetch(SHELL_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`shell fetch failed: ${response.status}`);
  const html = await response.clone().text();
  const pageCache = await caches.open(PAGE_CACHE);
  await pageCache.put(SHELL_URL, response);

  const assets = new Set(
    [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(
      (m) => m[1],
    ),
  );
  const staticCache = await caches.open(STATIC_CACHE);
  await staticCache.addAll([...assets]);
}

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
