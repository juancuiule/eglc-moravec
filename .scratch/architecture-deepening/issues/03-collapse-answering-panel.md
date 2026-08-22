# 03: Collapse AnsweringView and PracticePlayingScreen into one AnsweringPanel

**What to build:** A single `AnsweringPanel` module owns the timer, keyboard handling, calculator grid, and feedback overlay currently duplicated (~90%) between `AnsweringView.tsx` and `PracticePlayingScreen.tsx`. Level play and practice mode both render through it, supplying their own header content and store actions.

**Blocked by:** 01 (shared trial engine) — once both stores expose the same action surface, the duplicated UI collapses onto one component instead of fighting two divergent call shapes.

**Status:** ready-for-agent

- [x] `AnsweringPanel` component owns: trial-reset effect, countdown timer (`setInterval` → timeout callback), auto-advance after review, keyboard input handling, the calculator button grid, and the feedback overlay.
- [x] It accepts as props/slots: the current operation, playing/reviewing state, `submitAnswer`/`timeUp`/`advance`/`requestHint` callbacks, hint state, and a header/extra-content slot (so level play can show trial count + hint budget, and practice can show correct count + Stop button + category label).
- [x] `AnsweringView.tsx` and `PracticePlayingScreen.tsx` (or their replacements) become thin adapters that supply mode-specific header content and wire up their own store's actions.
- [x] Visual output and interaction behavior are unchanged for both level play and practice mode (verified by running the app: countdown, digit entry, backspace/delete/enter, hint reveal, feedback overlay, auto-advance).
- [x] No regressions in `game`/`practice` store tests (this ticket only changes the view layer).
