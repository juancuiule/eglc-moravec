# 04: Repurpose PlayingScreen as the real level-play adapter

**What to build:** `PlayingScreen.tsx` stops being a single-prop pass-through with no implementation behind it. It either becomes the thin adapter that assembles `AnsweringPanel` with the level-play header (trial count, hint budget), or is deleted and `App.tsx` imports the level-play adapter directly.

**Blocked by:** 03 (AnsweringPanel collapse) — this is the assembly point that only exists once `AnsweringPanel` does.

**Status:** ready-for-agent

- [x] `PlayingScreen.tsx` either assembles `AnsweringPanel` with level-play-specific header content, or is removed with `App.tsx` updated to import the level-play adapter directly.
- [x] No behavior change for the player.
- [x] `App.tsx`'s import of `PlayingScreen` is updated to match whichever shape is chosen.
