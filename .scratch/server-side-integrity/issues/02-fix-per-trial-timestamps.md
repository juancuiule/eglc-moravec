# 02: Fix per-trial timestamps (Level + Practice)

**What to build:** `buildPersistedTrials` and `buildPersistedPracticeTrials` currently compute one shared `playedAt` timestamp for an entire finished-Level or stopped-Practice batch, stamping every trial in that batch identically. Each trial should get its own accurate timestamp instead.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `buildPersistedTrials` (Level) assigns each trial in the batch its own distinct, accurate `playedAt`, reflecting when that specific trial actually happened rather than when the whole batch was persisted.
- [ ] `buildPersistedPracticeTrials` (Practice) gets the same fix, for the same reason — it copied the original shared-timestamp pattern.
- [ ] Existing tests updated to assert distinct per-trial timestamps rather than one shared value across a batch.
- [ ] No change to what's stored beyond the timestamp values themselves — `correct`/`timeExceeded`/`timeTaken`/`categoryCodename`/`keystrokes` are unaffected.
