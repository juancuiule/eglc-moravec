# 07: Migrate every consumer off localStorage onto the shared RxDB collections

**What to build:** With Trial-results (04) and Level-stats (05) both reliably synced through RxDB, drop `apps/frontend/src/storage/trialHistory.ts` and `apps/frontend/src/storage/levelStats.ts` entirely — RxDB becomes the single local source of truth for both, replacing the parallel localStorage caches that exist today. Every current consumer moves onto the official React hooks (ticket 03) reading the shared collections directly:

- `isLevelUnlocked`'s callers (`LevelPlay`'s unlock-check, `LevelsList`) read the `levelStats` collection instead of `loadLevelStats()`.
- `LevelsList`'s row data (stars, time, played state) comes from the same collection, live-updating as corrections or new records land.
- `StatsScreen`'s `computeStats` aggregation runs over the `trialResults` collection instead of `loadTrialHistory()` — `computeStats` itself is already a pure function over a plain array, so this is a read-path change, not a rewrite of the aggregation logic.
- `persistFinishedLevel.ts` writes the optimistic local Trial/Level-stats records (per tickets 04–05) instead of calling `appendTrials`/`updateLevelRecord`.

**Blocked by:** 04 (Trial-results push replication), 05 (Level-stats pull replication)

**Status:** ready-for-agent

- [ ] `apps/frontend/src/storage/trialHistory.ts` and `apps/frontend/src/storage/levelStats.ts` are deleted, along with anything that only existed to call them.
- [ ] Level unlock-gating, the Levels list, and the Stats screen all read live from the shared RxDB collections and behave identically to today from the player's perspective (aside from the intentional Level-stats correction behavior from ticket 05).
- [ ] No remaining code path reads Trial history or Level stats from `localStorage`.
- [ ] Existing tests for the migrated components are updated to reflect the new (RxDB-backed, hook-driven) data source, not weakened or deleted wholesale.
