# 01: Extract a shared "on completion → persist" seam

**What to build:** `FinishedScreen`'s persist-on-mount logic (`updateLevelRecord`, `appendTrials`, `pushResults`, `pushLevelStats`) moves out of the component's mount effect into a seam tied to the game store reaching `Finished`, instead of "this component happened to render." No player-visible behavior change — this is a prefactor for ticket 02, which needs the same shape of hook for Practice sessions.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The "a Level finished → persist locally, then sync if logged in" behavior is triggered by the game store's state reaching `Finished`, not by a component mounting — testable without mounting React.
- [ ] `FinishedScreen.tsx` no longer contains the persistence/sync logic inline in a `useEffect([], eslint-disabled)`; it either calls the new seam or the seam fires independently of the component.
- [ ] Existing Level persistence behavior is unchanged: `LevelStats`, trial history, and (for logged-in Users) the `pushResults`/`pushLevelStats` Sync calls still fire exactly once per finished Level, with the same data.
- [ ] All existing tests pass; new tests cover the extracted seam directly (no React mounting required).
- [ ] Verified live: finishing a Level still updates `LevelStats`/trial history locally, and still syncs to the backend when logged in.
