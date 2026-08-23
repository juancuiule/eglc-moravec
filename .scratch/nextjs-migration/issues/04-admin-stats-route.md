# 04: Admin Stats route (server-rendered)

**What to build:** Visiting `/admin` on the new app shows the same per-level and per-category aggregate stats the current Admin Stats page shows, fetched and rendered on the server with no client-side loading state.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `/admin` is a Server Component that calls `Api`'s admin-stats function directly (no TanStack Query involved) and renders the result.
- [ ] The page's content matches today's Admin Stats page: per-level and per-category aggregates (attempt count, user count, effectiveness, avg time).
- [ ] `/admin` remains unlinked from any nav (reachable only by visiting the URL directly), matching the existing deliberate no-access-control posture.
- [ ] Verified live: visiting `/admin` against the real running backend shows real aggregate data.
