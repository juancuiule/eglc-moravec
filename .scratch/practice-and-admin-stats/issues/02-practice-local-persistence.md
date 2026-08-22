# 02: Persist Practice sessions locally

**What to build:** When a Practice session stops, its trials are recorded to a new local-only Practice trial history — the same "recorded for stats" treatment Level trials get, minus Sync (Practice stays local-only, per the grilling session: it's explicitly low-stakes and doesn't need cross-device continuity).

**Blocked by:** 01

**Status:** ready-for-agent

- [x] A new local storage module (separate key and type from Level's `PersistedTrial` — no `levelNumber` field, since Practice trials have none) stores finished Practice trials.
- [x] On a Practice session's `stop()`, its trials are written to this storage via the seam extracted in ticket 01 (Practice becomes the second adapter over that seam, not a copy-paste of `FinishedScreen`'s old inline logic).
- [x] Nothing about this touches `apps/backend` or any Sync code — purely local, purely additive to the frontend.
- [x] A page reload after stopping a Practice session shows the recorded trials are still present in local storage (directly inspectable, even before ticket 03 gives them a UI).
- [x] Existing Level persistence (ticket 01's behavior) is unaffected.
