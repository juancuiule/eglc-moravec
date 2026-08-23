# Moravec — Remaining Backlog

Everything else this file used to track (scoring model, stars, persistence, level progression, stats, practice mode, hints, keystroke telemetry) has been built — see the code, not this file, for how. Domain terms used below are defined in `CONTEXT.md`.

---

## Hidden operation mode

At higher difficulty Levels, the Operation disappears from the screen after a short delay (e.g. 2–3s) and the player must solve it from memory.

**What needs to be built**
- A per-level `hiddenAfterMs: number | null` field in `LEVELS.ts` (`null` = always visible; give it a value on the higher-numbered levels).
- An `operationVisible: boolean` field in the game store's `Playing` state, defaulting to `true`, flipped by a `hideOperation` action fired from a `setTimeout` keyed off `hiddenAfterMs` when a trial starts.
- The operation display should fade out rather than disappear abruptly — see the animation/easing guidance noted in `CONTEXT.md`'s engineering-context section before picking a transition.

---

## Tutorials

Each Operation category gets an explanatory screen: technique name, a worked example, optionally an image.

**What needs to be built**
- A `TutorialsList` screen (one row per category) and a per-category `TutorialDetail` screen.
- Content authored as plain objects in `src/tutorials/content.ts` — no CMS.
- Entry point from the main menu.

---

## Internationalisation (i18n)

Spanish and English, matching the original app (see `CONTEXT.md`'s research background — Moravec's original data came from Spanish-speaking users, and some domain effects like the rhymed-order error pattern are language-specific).

**What needs to be built**
- `i18next` + `react-i18next`, `src/i18n/en.ts` and `src/i18n/es.ts`.
- Replace hardcoded UI strings with `t('key')` calls.
- A language toggle or `navigator.language`-based default.
