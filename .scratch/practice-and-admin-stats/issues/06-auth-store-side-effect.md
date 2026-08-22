# 06: Fix auth/store's import-time network call

**What to build:** `restoreSession()` is called explicitly from `App.tsx`'s startup instead of firing as a side effect the moment `auth/store.ts` is imported. `auth/store.ts` becomes pure wiring — consistent with `game/store.ts` and `practice/store.ts`, which have no import-time side effects.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `auth/store.ts` no longer triggers a network call merely by being imported.
- [x] `App.tsx` (or an equivalent single startup point) explicitly calls `restoreSession()` once, at app start.
- [x] No behavior change: a returning logged-in User still gets their session validated and LevelStats synced on load, exactly as before.
- [x] Existing auth store tests still pass.
