# 05: Cache the app shell for cold-start offline access (PWA, scoping ticket)

**What to build:** A lighter, forward-looking scoping ticket, not fully designed — and deliberately sequenced last, after every database/sync-related ticket above (01–04), by choice rather than by a technical dependency (nothing here blocks or is blocked by that work). Add a service worker and web app manifest so the app can be launched with zero network connectivity, matching the original native app's cold-start offline experience — something the Level-catalog replication work (tickets 01–02) cannot provide on its own, since a server-rendered page can't fall back to anything local if the app shell itself never loaded. Scope, the exact caching strategy (which routes/assets are precached vs. cached at runtime), install-prompt behavior, and how the cache is invalidated on a new deploy are all still open and should be resolved when this ticket is picked up, not assumed here.

**Blocked by:** None (can start immediately — independent of the database/sync work; sequenced last intentionally)

**Status:** ready-for-agent

- [ ] Decide and document the service worker/caching strategy (precache vs. runtime cache, which routes/assets, versioning/invalidation on deploy).
- [ ] The app can be launched and its shell renders with zero network connectivity, after at least one prior successful visit.
- [ ] The cache invalidates correctly on a new deploy — no stale app shell served indefinitely.
- [ ] End-to-end verification with tickets 01–02: a Level page opened fully offline, from a cold app launch, works using both the cached shell and the locally-replicated catalog.
