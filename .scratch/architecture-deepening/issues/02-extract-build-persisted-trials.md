# 02: Extract buildPersistedTrials out of FinishedScreen's lifecycle effect

**What to build:** The level-completion → `localStorage` mapping (what gets persisted, in what shape) becomes a pure, unit-tested function instead of being computed inline inside a React `useEffect`. No behavior change.

**Blocked by:** None (can start immediately, independent of ticket 01)

**Status:** ready-for-agent

- [x] A pure function (e.g. `buildPersistedTrials(config, results): PersistedTrial[]`) lives in `src/storage/` (or `src/stats/`), taking a `GameConfig` and `TrialResult[]` and returning the `PersistedTrial[]` shape currently built inline in `FinishedScreen.tsx`'s `useEffect`.
- [x] `FinishedScreen.tsx`'s `useEffect` calls this function instead of inlining the `results.map(...)` mapping, and still calls `updateLevelRecord`/`appendTrials` with its output.
- [x] New unit tests cover the mapping directly (field-by-field), without rendering React.
- [x] Existing behavior is unchanged: same `PersistedTrial` shape written to `localStorage`, same `updateLevelRecord` call with `stars`/`totalTime`.
