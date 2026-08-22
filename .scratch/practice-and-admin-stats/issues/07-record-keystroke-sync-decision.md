# 07: Record the keystroke-sync-boundary decision

**What to build:** A short written note documenting that per-keystroke data is captured locally (`TrialResult.keystrokes`) but intentionally not synced to the backend — so it isn't rediscovered as an oversight later and doesn't get "fixed" by someone unaware it was deliberate.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] A note exists (an ADR in `docs/adr/`, or an addition to `CONTEXT.md`/this backlog) stating: keystroke traces are captured client-side and stored locally, but `sync/push.ts` deliberately excludes them from the payload sent to the backend, since nothing server-side reads them yet.
- [x] The note explains why this might matter later (it's exactly the kind of signal a future anti-cheat pass — already deferred by ADR-0002 — would want) without committing to building anything now.
- [x] No code changes.
