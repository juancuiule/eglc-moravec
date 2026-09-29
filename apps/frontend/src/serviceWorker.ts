// Registers the offline app-shell service worker. Deliberately skipped in
// dev (a SW caching dev chunks would fight HMR, and API calls are
// cross-origin there so they never intersect it anyway) and in insecure
// contexts — a plain-HTTP LAN deploy (e.g. http://raspberrypi.local) has no
// serviceWorker support, and degrades to online-only without complaint.
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  if (typeof window !== "undefined" && !window.isSecureContext) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}
