# 05: Pull + merge remote LevelStats on OTP login

**What to build:** Logging in on a fresh device brings your progress with you — completing the Sync loop that ticket 04 started (push without a pull is backup, not sync).

**Blocked by:** 04

**Status:** ready-for-agent

- [x] Backend endpoint returning the current User's stored LevelStats (all levels).
- [x] Frontend: right after OTP verify (and on app load when a session already exists), fetch the User's remote LevelStats and merge each into local `LevelStats` using the same better-record comparison `updateLevelRecord` already applies (more stars wins; tie broken by less total time).
- [x] Verified end-to-end: play and complete a Level on one browser profile while logged in, then log in as the same User on a fresh browser profile with no local data — the completed level's stars appear there without playing it.
- [x] Merging never *downgrades* local stats that are already better than the remote record.
