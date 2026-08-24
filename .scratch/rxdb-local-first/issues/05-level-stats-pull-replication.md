# 05: Sync Level stats via RxDB pull, with an optimistic local write for offline play

**What to build:** A new `levelStats` collection on the shared database — pull-only from RxDB's perspective (the client never pushes a Level-stats candidate as an assertion the server has to trust; the server derives the authoritative best record from validated Trial data, per ticket 04, and the client only ever pulls it). The moment a Level finishes, the client writes its own optimistic best-record guess directly into the local collection (a plain local upsert, not a replicated push) so unlock-gating and the Levels list keep working immediately with zero network — this is the offline-capable half. Once the corresponding Trial-results push (ticket 04) is confirmed, a pull refresh (triggered right after that confirmation, not just on the next periodic/reconnect cycle) brings back the server's authoritative Level-stats doc and overwrites the local optimistic guess with it — whether that's the same value, a correction, or a better value from another device's already-synced session.

This replaces `apps/frontend/src/sync/syncLevelStatsFromRemote.ts`'s one-shot pull-on-login and the Level-stats half of `pushResults.ts`. The comparison that decides whether a candidate is actually the new best (more stars, or same stars with less time) stays exactly where it already lives correctly: server-side, in `upsertLevelStatsIfBetter` — nothing client-side needs its own copy of that comparison anymore once the client is unconditionally trusting whatever the server returns.

**Blocked by:** 03 (shared database), 04 (Trial-results push — Level-stats' authoritative value is derived from validated Trial data on the same backend request)

**Status:** ready-for-agent

- [ ] A better result achieved while offline becomes the recorded best once its Trial-results push is confirmed and the resulting pull lands — regardless of which device achieved it or when, exactly as if it had been achieved online (see this session's design discussion for why connectivity timing plays no role in the comparison).
- [ ] Unlock-gating and the Levels list keep working immediately after finishing a Level, with zero network required — the optimistic local write, not a round trip, drives that.
- [ ] A Level-stats correction (the server's authoritative record differing from what the client optimistically guessed) is reflected locally once the pull catches up — no client-side logic re-decides whether it's "better," the server's returned value is simply trusted.
- [ ] Logging in on a new device (or after the anonymous-to-real upgrade — see ticket 06) correctly pulls in the account's existing best records, merged the same way a same-device correction is.
- [ ] Practice sessions remain unaffected — they aren't synced yet (see ticket 08).
