# 05: Derive a single CurrentScreen interface for App.tsx routing

**What to build:** `App.tsx` renders off one discriminated-union `CurrentScreen` type instead of branching on `gameState.type` + `practiceState.type` + local `screen` independently. The "at most one session active" invariant becomes a fact of the type, not emergent wiring between `LevelSelection`/`PracticeModeSelection` callbacks.

**Blocked by:** 04 (PlayingScreen adapter) — routing should be typed against the settled component shape, not re-derived once the UI structure changes underneath it.

**Status:** ready-for-agent

- [x] A pure function/hook derives a single `CurrentScreen` discriminated union from `gameState`, `practiceState`, and the local `screen` nav state.
- [x] `App.tsx`'s render logic switches on this one value instead of the current nested `if` chain.
- [x] The invariant "game and practice sessions are never both active" is either enforced by the derivation (e.g. exhaustive switch with no reachable invalid combination) or explicitly asserted, rather than relying on which components choose to expose which navigation callbacks.
- [x] No behavior change: same screens render in the same situations as before.
- [x] Adding a future mode (e.g. tutorials, per ROADMAP group 6) only requires adding one case to the derivation, not touching the nested `if` chain.
