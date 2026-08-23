# 11: Cutover to the new frontend

**What to build:** The new Next.js app fully replaces the old Vite app as `apps/frontend` — nothing references the old app anymore, and the decisions behind this migration are recorded for future readers.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] The old Vite-based `apps/frontend` is removed.
- [ ] The new app is renamed to `apps/frontend`, and every reference to the old package name/paths (root scripts, `docker-compose.yml`, READMEs) is updated.
- [ ] A new ADR records the migration's key decisions: the routing/rendering model, the scope of TanStack Query, the single-`Api`-object pattern, and the auth-store restructuring — explaining the reasoning so a future reader doesn't have to reconstruct it.
- [ ] Full workspace typecheck/test/build passes with the old app gone.
