# 03: Consolidate RxDB into one shared database, using RxDB's official React hooks

**What to build:** Replace the ad hoc database instance and hand-rolled `useEffect`/`useState` plumbing from tickets 01–02 with RxDB's official React integration (`RxDatabaseProvider`, `useRxCollection`, `useRxQuery`/`useLiveRxQuery`, `useRxDocument`) — a real, purpose-built reactive layer this project didn't know about while building tickets 01–02. One shared `RxDatabase` (still just the `levels` collection for now — trial-results and level-stats collections arrive in later tickets, but the database and provider need to already be shaped to hold more than one) replaces the current single-purpose Levels database. The boot sequence resolves that one database once near the app root and renders `RxDatabaseProvider` around the app once it's ready; every consumer below the provider reads through the official hooks instead of its own manual subscription code.

**Blocked by:** None (01 and 02 are already shipped; this retrofits their code)

**Status:** ready-for-agent

- [ ] There is exactly one `RxDatabase` instance for the whole app, wrapped in `RxDatabaseProvider` near the root, resolved once during boot.
- [ ] The Level catalog replication from ticket 01 keeps working unchanged (still pull-only, still populates automatically, still retries on reconnect) — now living in a collection on the shared database.
- [ ] The Level page's offline-fallback behavior from ticket 02 keeps working unchanged (same tests still pass, same console warning, same unavailable state) — now reading through `useRxDocument`/`useRxQuery` instead of the hand-rolled `useAvailability` hook.
- [ ] No component below the provider contains its own manual `useEffect` + `useState` + `.exec()` subscription to an RxDB collection — that pattern is fully replaced by the official hooks.
- [ ] Existing tests for tickets 01–02 pass against the retrofitted code (adjusted for the new structure where needed, not weakened).
