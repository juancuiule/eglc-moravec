# 04: Sync Trial results reliably via RxDB push replication

**What to build:** A new `trialResults` collection on the shared database (ticket 03), replicated to the backend via RxDB push (no pull) — replacing `pushResults.ts`'s fire-and-forget `POST /sync/results` call, which drops a submission for good if it fails while the device is offline and the app is later closed. Each Trial gets a client-generated primary key (today's `trial_results.id` is a server autoincrement with no dedup key — harmless while push was fire-and-forget-only, a real problem once retries are real). The document schema carries the client's original claim (`clientCorrect`/`clientTimeExceeded`, immutable) alongside the server-authoritative fields (`correct`/`timeExceeded`, unset until the backend fills them in) — mirroring the existing `trial_results` table's column split exactly.

The backend gets a new route matching RxDB's push-replication contract: it receives a batch of pushed Trial documents, independently re-validates each one's correctness from its raw operands/answer/timeTaken using `packages/engine` — exactly what `evaluateTrialResult` (`apps/backend/src/sync/logic.ts`) already does today — and returns every document back with its authoritative `correct`/`timeExceeded` filled in (this is enrichment, not a real conflict: the client structurally cannot know these fields until the backend computes them, so every push gets a filled-in response, not only ones where the client's claim happened to be wrong). `level_runs` and `level_stats` continue to be derived and updated server-side from this same batch, unchanged from today's logic — ticket 05 covers how the client learns about the resulting Level-stats.

**Blocked by:** 03 (Consolidate RxDB into one shared database, using RxDB's official React hooks)

**Status:** ready-for-agent

- [ ] A finished Level's Trial results reach the backend reliably, retried automatically, even if the device was offline when the Level was finished and the app is later closed before reconnecting — no submission is silently lost.
- [ ] Retrying an already-delivered push (e.g. after a dropped response) never double-inserts a Trial server-side — the client-generated id is a real, enforced dedup key.
- [ ] The backend still independently verifies correctness for every submitted Trial using `packages/engine`, exactly as today — the client's own claim is never trusted outright, and is kept forever alongside the authoritative value for auditing (mirrors today's `client_correct`/`correct` column split).
- [ ] `level_runs` (every playthrough, append-only) and `level_stats` (the derived best-record cache) are still updated server-side from validated Trial data, using the existing, unchanged comparison logic.
- [ ] Practice sessions remain unaffected — they aren't synced yet (see ticket 08).
