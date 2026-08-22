# 05: Admin stats frontend page

**What to build:** A frontend screen rendering ticket 04's two aggregate tables (by level, by category) — reachable only by typing its URL, not linked from `LevelSelection`'s nav row alongside Practice/Stats.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] A new screen/route fetches and renders both aggregate tables from ticket 04's endpoint(s).
- [x] Not linked anywhere in the existing nav (`LevelSelection`, `StatsScreen`, etc.) — URL-only access, per the grilling session (no auth exists yet, so this is the only access control for now).
- [x] No new auth/session requirement to view it — matches ticket 04's unauthenticated route.
- [x] Verified live: navigating directly to the route shows real aggregate data reflecting seeded/played trials.
