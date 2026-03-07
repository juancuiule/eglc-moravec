# Moravec — Feature Roadmap

All persistence uses **`localStorage`** (survives page reload) or **`sessionStorage`** (session only, noted per feature).
No backend is involved.

---

## Group 1 — Core game mechanics

These change how a game session is scored and felt. They should be tackled first because later groups build on top of them.

---

### 1.1 Pass/fail threshold

**What it is**
A level is only _completed_ if the player answers at least **15 out of 20** trials correctly within time. Finishing 20 trials without reaching 15 correct is a failed run.

**What needs to be built**
- Add a `levelCompleted: boolean` field to the `Finished` state derived from `results.filter(r => r.correct && !r.timeExceeded).length >= 15`.
- Update `FinishedScreen` to branch into two layouts:
  - **Completed** — green theme, stars, "Play next" and "Replay" buttons.
  - **Failed** — red/pink theme, "Try again" button only.

**Notes**
- Depends on 1.2 (time-exceeded logic) to know which correct answers actually count.

---

### 1.2 Correct-but-slow answers don't count

**What it is**
A correct answer submitted _after_ `solveTime` expires is recorded as correct but does **not** advance the trial count toward the 20. The slot is burned — you get neither a correct nor a point for it.

**What needs to be built**
- Add `timeExceeded: boolean` to `TrialResult` in `src/game/index.ts`.
- Populate it in `submitAnswer` by comparing `timeTaken > operation.solveTime()`.
- Populate it as `true` in `timeUp` (always exceeded).
- In the `advance` action, only increment the effective trial counter when `!result.timeExceeded || !result.correct`. Keep a separate `trialsConsumed` counter in `Playing` state.
- In `FinishedScreen`, show the effective correct count (correct + within time) separately from total attempts.

---

### 1.3 Stars rating (0–3)

**What it is**
The number of in-time correct answers determines a 0–3 star rating shown at the end of a completed level.

| Correct (in time) | Stars |
|---|---|
| < 15 | 0 (level failed) |
| 15–16 | 1 |
| 17–19 | 2 |
| 20 | 3 |

**What needs to be built**
- Pure function `starsForScore(correct: number): 0 | 1 | 2 | 3` in a utility module.
- `StarsDisplay` component — three star icons, filled/hollow depending on count.
- Add stars to the `Finished` state and display them in `FinishedScreen`.

---

### 1.4 Fixed 20 trials per level

**What it is**
Each level always runs for exactly 20 trials. The configurable `nTrials` field in `GameConfig` should be removed from the UI (or locked to 20 when playing a real level). Practice mode (group 4) is the free-form alternative.

**What needs to be built**
- Remove the "Number of trials" input from `StartScreen`.
- Hardcode `nTrials: 20` in `GameConfig` when starting a level.
- Keep the `nTrials` field in the type for practice mode flexibility.

---

### 1.5 Hidden operation mode

**What it is**
At higher difficulty levels, the operation disappears from the screen after a short delay (e.g. 2–3 seconds) and the player must solve it from memory. Controlled by a per-level `hiddenAfterMs: number | null` field (`null` = always visible).

**What needs to be built**
- Add `hiddenAfterMs: number | null` to the `Level` type and update `LEVELS.ts` (levels 7+ get a value).
- Add an `operationVisible: boolean` field to `Playing` state, defaulting to `true`.
- A `hideOperation` action transitions it to `false`.
- In `AnsweringView`, set a `setTimeout` on trial start using `hiddenAfterMs`; on fire, dispatch `hideOperation`.
- The operation display fades out (`opacity-0`) instead of disappearing abruptly.

---

## Group 2 — Progression & persistence

These features require `localStorage` and build the "game as a long-term journey" experience.

---

### 2.1 Persistent level stats (`localStorage`)

**What it is**
Each played level stores its best result. A new run only overwrites the record if it achieves more stars, or the same stars in less total time.

**Storage key:** `moravec:levelStats`
**Shape:**
```ts
type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms, sum of all trial times
  completedAt: string; // ISO date
};
type PersistedLevelStats = Record<string, LevelStats>; // keyed by level number
```

**What needs to be built**
- `src/storage/levelStats.ts` — `loadLevelStats()`, `saveLevelStats(stats)`, `updateLevelRecord(level, result)` with the better-record comparison logic.
- Call `updateLevelRecord` after a level finishes (in `FinishedScreen` via a `useEffect`).
- Expose the persisted stats to `StartScreen` / `LevelSelection` to show stars on each level button.

---

### 2.2 Sequential level unlocking

**What it is**
Only levels the player has already played, plus the next unlocked one, are accessible. A level becomes unlocked only after the previous one is _completed_ (≥ 15 correct in time).

**What needs to be built**
- Replace the current flat `StartScreen` level dropdown with a `LevelSelection` screen listing level buttons.
- Each button shows: level number, best stars, best time (if played), or a lock icon (if not yet unlocked).
- A level is unlocked if `levelStats[n - 1]?.stars > 0` (i.e. it was completed), or `n === 1`.
- Locked level buttons are rendered but disabled.

---

### 2.3 Replay / Play next

**What it is**
After finishing a level the player can:
- **Replay** — restart the same level immediately.
- **Play next** — advance to the next level (only shown when the level was completed).
- **Back to menu** — return to `LevelSelection`.

**What needs to be built**
- `FinishedScreen` receives the level number and completion status as props.
- Three action buttons wired to the appropriate store actions (`reset` + `load` with the right level, or navigate to menu).
- "Play next" is hidden when `levelCompleted === false` or when on the last level.

---

### 2.4 Persistent trial history (`localStorage`)

**What it is**
Every trial result (operation type, correct, time taken, time exceeded) is appended to a history log across all sessions. This powers the stats screen (group 3).

**Storage key:** `moravec:trialHistory`
**Shape:**
```ts
type PersistedTrial = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
};
```

**What needs to be built**
- `src/storage/trialHistory.ts` — `loadTrialHistory()`, `appendTrials(trials)`.
- After each level finishes, serialize and append the session's trials to `localStorage`.
- Cap history to a reasonable size (e.g. last 2000 trials) to avoid unbounded growth.

---

## Group 3 — Statistics

Depends on Group 2 persistence being in place.

---

### 3.1 Stats screen

**What it is**
A screen accessible from the main menu showing per-operation-category performance aggregated across all stored trials.

**Columns per category:**
- Category name (e.g. `2d×1d`)
- Effectiveness — % of trials answered correctly within time
- Average time — mean time of in-time correct answers

**What needs to be built**
- `src/stats/computeStats.ts` — pure function over `PersistedTrial[]` producing per-category aggregates.
- `StatsScreen` component with a table layout, one row per category.
- Categories with zero attempts show a placeholder row ("No data yet").
- A "Stats" button on the main menu / level selection screen navigating to this screen.

---

### 3.2 Per-category drilldown

**What it is**
Tapping a category row opens a detail view showing the distribution of response times for that category as a simple bar chart or dot plot.

**What needs to be built**
- `CategoryStatsDetail` component.
- A lightweight histogram: bucket correct-trial times into ranges (e.g. every 1s) and render as a bar chart with plain `div` elements (no chart library needed at this scale).
- Navigation: back button from detail to the stats list.

---

## Group 4 — Practice mode

Independent of progression; can be built in parallel with Group 2.

---

### 4.1 Practice mode — free session

**What it is**
A mode where the player picks a single operation category and practises it indefinitely with no level constraints, no stars, and no pass/fail threshold. The timer still runs (for self-awareness) but a timeout just triggers the next trial rather than counting against you.

**What needs to be built**
- `PracticeConfig` type: `{ category: OperationCategory["codename"] }`.
- A new `Practice` top-level state in the game store (or a separate `practiceStore`) with the same `answering → reviewing → answering` loop but no `Finished` state — just loops indefinitely until the user taps "Stop".
- `PracticeModeSelection` screen: grid of operation category buttons.
- A "Practice" entry point from the main menu.
- Session results (not persisted) shown in a dismissible summary overlay when the player stops.

---

## Group 5 — Hints

Can be built independently; integrates with the game loop.

---

### 5.1 Hint system — data model

**What it is**
Each operation type has a strategy for generating a step-by-step hint:
- **Addition**: no hint (the operation is already simple enough).
- **Multiplication**: positional decomposition — e.g. `23×4` becomes `20×4 + 3×4`.
- **Squaring**: algebraic identity — `x² = (x−a)(x+a) + a²`, recursively expanded until single digits.

**What needs to be built**
- `src/operations/hints/` directory with:
  - `MultiplicationHint.ts` — decomposes left operand by digit position.
  - `SquaringHint.ts` — applies the `(x−a)(x+a)+a²` identity recursively.
  - `NoHint.ts` — empty hint for addition.
- `Operation.hint()` method already exists as a stub — implement it to return the appropriate hint object.
- Each hint exposes `hasHint(): boolean` and `getSteps(): string[]`.

---

### 5.2 Hint system — UI

**What it is**
During a trial the player can tap a "Hint" button. This reveals the hint card (animated fade-in), costs one of a limited budget (3 hints per level, unlimited in practice). The budget is shown as `X/3` in the header.

**What needs to be built**
- `hintsRemaining: number` and `hintVisible: boolean` fields in `Playing` state.
- `requestHint` action: sets `hintVisible = true`, decrements `hintsRemaining` (only on first request per trial).
- `HintCard` component: renders `getSteps()` as a stacked list of strings, fades in on mount.
- Hint button in `AnsweringView` header row, disabled when `hintsRemaining === 0` or `!operation.hint().hasHint()`.
- `hintShown: boolean` recorded per `TrialResult` for stats.

---

## Group 6 — Content & onboarding

Lower priority; can be deferred until the core experience is solid.

---

### 6.1 Tutorial screens

**What it is**
Each operation category has an explanatory screen with text, images, and the mental math technique to use. Accessible from the main menu and optionally surfaced before a player first encounters a new category in a level.

**What needs to be built**
- `TutorialsList` screen: one row per category.
- Per-category `TutorialDetail` screen with: technique name, worked example (static content), and optionally an image.
- Content authored in `src/tutorials/content.ts` as plain objects (no external CMS).
- "Tutorials" entry point from the main menu.

---

### 6.2 Internationalisation (i18n)

**What it is**
All UI strings extracted into locale files, with Spanish and English as the initial targets (matching the original app).

**What needs to be built**
- Install `i18next` + `react-i18next`.
- `src/i18n/` with `en.ts` and `es.ts` locale files.
- Replace all hardcoded strings in components with `t('key')` calls.
- A language toggle (or automatic detection via `navigator.language`) in the settings or header.

---

## Group 7 — Key-press telemetry

Low UI impact; high data-quality value. Can be added incrementally.

---

### 7.1 Per-keystroke timing

**What it is**
Record the timestamp of each digit press and erase within a trial, relative to trial start. Stored alongside the trial result.

**What needs to be built**
- Add `keystrokes: { key: string; t: number }[]` to `TrialResult`.
- Update `handleButton` and the keydown handler in `AnsweringView` to push `{ key, t: Date.now() - startedAt }`.
- Include in `PersistedTrial` when writing to `localStorage`.

---

### 7.2 Erase tracking and streak

**What it is**
Track whether the player erased during a trial (`hasErased`), and the running correct-in-a-row streak at the time of each trial (`streakAtSubmit`). Useful for stats analysis.

**What needs to be built**
- Add `hasErased: boolean` and `streakAtSubmit: number` to `TrialResult`.
- `hasErased` set to `true` in the store when `⌫` is pressed during an `answering` trial.
- `streakAtSubmit` derived from consecutive correct results in `Playing.results` at submit time.

---

## Implementation order

| Phase | Groups | Goal |
|---|---|---|
| 1 | 1.1 → 1.4 | Correct scoring model and fixed 20-trial format |
| 2 | 2.1 → 2.3 | Persistence and progression between levels |
| 3 | 3.1 | Basic stats screen (needs phase 2 data) |
| 4 | 4.1 | Practice mode |
| 5 | 5.1 → 5.2 | Hints |
| 6 | 1.5 | Hidden operation mode (hardest mechanic, needs stable base) |
| 7 | 3.2, 7.1, 7.2 | Detail stats and telemetry |
| 8 | 6.1 → 6.2 | Tutorials and i18n |
