# 06: Server-derive stars/total-time; retire the separate client-trusted push

**What to build:** When a validated batch of a finished Level's trials lands via `POST /sync/results`, the backend computes that Level's `stars`/`totalTime` itself from the now-validated trials (same better-record-wins merge already in place for `level_stats`), instead of trusting a value separately pushed by the client. The client can no longer claim a star rating disconnected from what its own trials validate to.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] `stars`/`totalTime` for a finished Level are computed server-side from the validated trial batch submitted in the same `POST /sync/results` call — using the same threshold/star logic (`packages/engine`'s `starsForScore`/`LEVEL_COMPLETE_THRESHOLD`) the client itself uses.
- [x] The existing better-record-wins comparison (`isBetterLevelRecord`) still applies — a server-computed result only overwrites a stored `level_stats` row if it's genuinely better.
- [x] `POST /sync/level-stats` (the separate client-trusted push) and the frontend's corresponding call are removed.
- [x] `GET /sync/level-stats` (used for pull-and-merge on login) is unchanged — it keeps reading whatever's in the `level_stats` table, which is now written by the results endpoint instead.
- [x] Verified live: finish a Level while logged in, confirm `level_stats` reflects server-computed stars/time without any separate level-stats push happening; a fresh login on another profile still pulls the correct stars down.
