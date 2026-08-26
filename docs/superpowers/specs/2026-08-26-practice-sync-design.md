# Practice sessions sync to the backend

## Motivation

Practice trials are currently local-only (`CONTEXT.md`'s Sync entry states this
explicitly: "Practice sessions are never synced — local-only by design"). That
was a deliberate decision from an earlier design session, but it's being
reversed here: Practice trial results should reach the backend the same way
Level trials do, reusing `trial_results` rather than introducing a parallel
table, so the two kinds of runs can eventually be queried/analyzed together at
the trial level.

This is a scope reversal of a documented decision, not an oversight — `CONTEXT.md`
gets updated as part of this work so it doesn't go stale.

## Decisions made

These were confirmed explicitly before this design was written:

1. **Aggregation scope**: a synced Practice run only inserts rows into
   `trial_results`. It never touches `level_runs` or `level_stats` — those
   stay exactly what they are today, a Level-only "best record" / unlock cache.
   No `practice_runs` summary table is introduced.
2. **Discriminator shape**: a `run_type` text column (`'level' | 'practice'`),
   not a boolean — room for a third run kind later without a schema change,
   even though only two exist today.
3. **Discriminator placement**: per-trial, not per-batch. Every trial fully
   describes itself, consistent with `deriveLevelRuns`'s existing comment
   about not assuming a sync batch is homogeneous.
4. **`level_number` for Practice trials**: `trial_results.level_number` stays
   `NOT NULL` (no schema change, no table rebuild). The TypeScript-level
   domain types carry `levelNumber: number | null` for honesty; `null` is
   converted to the sentinel `0` (levels start at 1) at the point of the SQL
   insert in `sync/repo.ts`, and nowhere else.

## Schema changes (`apps/backend/src/db.ts`)

- Add to `COLUMN_MIGRATIONS`: `run_type TEXT NOT NULL DEFAULT 'level'` on
  `trial_results`. No backfill needed — `'level'` is correct for every row
  that predates this change, the same reasoning already used for
  `is_anonymous`.
- Rename `level_run_id` → `run_id`. This doesn't fit the existing
  `ColumnMigration` type (that's ADD-COLUMN-shaped with an optional
  backfill); add a small separate idempotent step: if `tableColumns` shows
  `run_id` missing and `level_run_id` present, run
  `ALTER TABLE trial_results RENAME COLUMN level_run_id TO run_id`. Node's
  bundled `node:sqlite` supports `RENAME COLUMN`.
- No change to `level_number`'s `NOT NULL` constraint.
- No new index for now (YAGNI) — the admin queries below add a `WHERE
  run_type = 'level'` predicate on top of existing `GROUP BY` columns; revisit
  with an index only if `trial_results` grows large enough for that scan to
  matter.

## Field rename ripple: `levelRunId` → `runId`

The DB column rename (`level_run_id` → `run_id`) isn't just a SQL-layer
detail — the same field exists under the name `levelRunId` all through the
TypeScript layers on both sides, and it renames too, everywhere:

- Backend: `TrialResultInput.levelRunId`, `EvaluatedTrialResult.levelRunId`,
  `TrialResultRow.level_run_id`, the `INSERT`/`SELECT` column lists in
  `sync/repo.ts`, and `isTrialResultInput`'s validator field check.
- Frontend: `SyncTrial.levelRunId` (`api/Api.ts`), `PersistedTrial.levelRunId`
  (`storage/trialHistory.ts`) and `buildPersistedTrials`'s `levelRunId`
  parameter, and the existing `sync/pushResults.ts`, which currently reads
  `t.levelRunId` when building its payload.

None of this is behavior change for Level — it's a pure rename, done once,
consistently, alongside the DB migration, rather than leaving the DB column
named `run_id` while the TypeScript layers still say `levelRunId`.

## Wire format & backend logic

**`apps/backend/src/sync/logic.ts`**
- `TrialResultInput` and `EvaluatedTrialResult` gain `runType: "level" |
  "practice"`; `levelRunId` renames to `runId` (see above).
- `levelNumber` becomes `number | null` in both types. `isTrialResultInput`'s
  validator accepts `null` alongside `number`.
- `evaluateTrialResult` passes `runType`/`levelNumber`/`runId` through
  unchanged (no scoring implication — `reconstructOperation`/`evaluateTrial`
  only need `categoryCodename`/`operands`/`answer`/`timeTaken`, none of which
  differ by run type).

**`apps/backend/src/sync/repo.ts`**
- `insertTrialResults` writes `run_type` and `run_id` (renamed column), and
  writes `t.levelNumber ?? 0` into the `level_number` column — the one and
  only place the `0` sentinel is materialized.
- `TrialResultRow` gains `run_type: string` and its `level_run_id` field
  renames to `run_id`.
- `mergeAnonymousIdentity` needs no change — its blanket `UPDATE trial_results
  SET email_hash = ?` already re-keys both kinds of rows correctly.

**`apps/backend/src/routes/sync.ts`**
`POST /sync/results` currently runs every incoming trial through
`deriveLevelRuns` → `insertLevelRuns` → `upsertLevelStatsIfBetter`
unconditionally. That has to change to only happen for the Level subset:

```
const evaluated = trials.map(evaluateTrialResult);
insertTrialResults(db, emailHash, evaluated);

const levelTrials = evaluated.filter((t) => t.runType === "level");
if (levelTrials.length > 0) {
  const runs = deriveLevelRuns(levelTrials);
  insertLevelRuns(db, emailHash, runs, Date.now());
  const syncedAt = Date.now();
  runs.forEach((run) => upsertLevelStatsIfBetter(db, emailHash, run.levelNumber, run, syncedAt));
}
```

This is what actually enforces decision #1 (Practice never touches
`level_runs`/`level_stats`) — without this filter, a Practice batch synced
today's way would either crash `deriveLevelRuns` (grouping by run id, then
reading `runTrials[0].levelNumber` — now possibly `null`) or, worse, silently
write bogus Level-run/stats rows.

## Admin queries fix (`apps/backend/src/admin/repo.ts`)

`getLevelPerformance` and `getCategoryPerformance` both query `trial_results`
with no filter today. Once Practice rows exist in that table:
- `getLevelPerformance` groups by `level_number` — Practice rows (sentinel
  `0`) would appear as a bogus "level 0" bucket.
- `getCategoryPerformance` groups by `category_codename` only — it would
  silently blend two incompatible play modes (Practice has no time-pressure
  penalty applied the same way, unlimited hints, no pass/fail) into what's
  meant to be Level-only per-category analytics.

Both queries add `WHERE run_type = 'level'`. This is a required part of this
change, not follow-up polish — without it, shipping Practice sync silently
corrupts existing admin analytics the moment Practice trials start arriving.

## Frontend changes

**`apps/frontend/src/api/Api.ts`**
- `SyncTrial` gains `runType: "level" | "practice"`; `levelNumber` becomes
  `number | null`; `levelRunId` renames to `runId` (see rename ripple above —
  `pushResults.ts` updates its one reference to match).

**New: `apps/frontend/src/sync/pushPracticeResults.ts`**
Parallel to the existing `sync/pushResults.ts`, not a generalization of it —
matches this codebase's existing convention of keeping Level and Practice as
separate parallel modules rather than one shared abstraction (see
`persistFinishedLevel.ts` vs `persistStoppedPractice.ts`,
`storage/trialHistory.ts` vs `storage/practiceHistory.ts`, and
`practiceHistory.ts`'s own comment about Practice/Level history staying
unmerged).

```
export function pushPracticeResults(
  token: string,
  results: PracticeTrialResult[],
  trials: PersistedPracticeTrial[],
): void {
  const payload: SyncTrial[] = trials.map((t, i) => ({
    runType: "practice",
    levelNumber: null,
    categoryCodename: t.categoryCodename,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
    timeTaken: t.timeTaken,
    playedAt: new Date(t.playedAt).getTime(),
    keystrokes: t.keystrokes,
    operands: results[i].operation.operands(),
    answer: results[i].answer,
    hintShown: t.hintShown,
    streakAtSubmit: 0,           // not a Practice concept — see note below
    hintsAvailableAtStart: 0,    // Practice hints are unlimited — see note below
    runId: t.runId,              // see PersistedPracticeTrial change below
  }));

  void Api.syncResults(token, payload).catch(() => {
    // best-effort; a failed sync never blocks or interrupts play
  });
}
```

Note: `streakAtSubmit`/`hintsAvailableAtStart` aren't tracked concepts in
Practice (no streak, no finite hint budget). Sending `0` for both is an
accepted rough edge under decision #1 (Practice data isn't feeding any
analytics yet) — `0` could misread later as "no hints left" rather than
"unlimited" to someone reading raw rows, but there's no product need to solve
that now.

Also note: Practice's `PracticeStopped`/`PersistedPracticeTrial` currently
carry no run id at all (`practice/store.ts`'s states have no `runId` field,
unlike `game/index.ts`'s `Playing`/`Finished`, which generate one via
`randomId()`). Since `trial_results.run_id` is being generalized to describe
*any* run, Practice needs one too — add a `runId: string` (via `randomId()`,
same helper Level uses) to `PracticeStopped`/`PersistedPracticeTrial`,
generated once when `start()` begins a session, alongside the existing
`config`/`results` fields.

**`apps/frontend/src/practice/persistStoppedPractice.ts`**
Gains an `authState: AuthState` parameter and now does both the local write
and the sync push, mirroring `persistFinishedLevel.ts` exactly:

```
export function persistStoppedPractice(state: PracticeStopped, authState: AuthState): void {
  const trials = buildPersistedPracticeTrials(state.results, state.runId);
  appendPracticeTrials(trials);
  if (authState.type !== "loggedOut") {
    pushPracticeResults(authState.token, state.results, trials);
  }
}
```

**`apps/frontend/src/storage/practiceHistory.ts`**
`PersistedPracticeTrial` gains a `runId: string` field (mirroring
`PersistedTrial.runId`, renamed from `levelRunId` per the rename ripple
above); `buildPersistedPracticeTrials` takes the session's `runId` as a
parameter and stamps it onto every trial, the same shape
`buildPersistedTrials` already uses for Level.

**`apps/frontend/src/components/PracticePlay.tsx`**
The existing `watchStoreTransition` callback changes from:
```
persistStoppedPractice(s.state);
```
to:
```
persistStoppedPractice(s.state, authStore.getState().state);
```
— an imperative `authStore.getState()` read, not a reactive `useAuth()`
subscription, matching `LevelPlay`'s pattern (and the reasoning behind it:
this callback's closure is created once in a `useEffect(() => {...}, [])`
with empty deps, so a reactively-subscribed value would go stale the moment
auth state changes after mount).

## `CONTEXT.md`

Update the Sync glossary entry (currently: *"Practice sessions are never
synced — local-only by design"*) to describe the new reality: Practice trials
sync at the trial level via `trial_results.run_type = 'practice'`, but never
feed `level_runs`/`level_stats` or the Levels unlock cache.

## Testing plan

**Backend**
- `sync/logic.test.ts`: `evaluateTrialResult`/`parseTrialResults` accept
  `runType: "practice"` and `levelNumber: null`.
- `db.test.ts`: migration adds `run_type` (default `'level'`) to a
  pre-existing fixture DB, and the `level_run_id` → `run_id` rename applies
  idempotently (running `openDb` twice doesn't error).
- `routes/sync.test.ts`: posting a batch of `runType: "practice"` trials
  inserts into `trial_results` with `level_number = 0`, and does **not**
  create/update any `level_runs` or `level_stats` row.
- `admin/logic.test.ts` (or a new `admin/repo.test.ts` if none exists):
  `getLevelPerformance`/`getCategoryPerformance` exclude `run_type =
  'practice'` rows from their aggregates.

**Frontend**
- `sync/pushPracticeResults.test.ts` (new), mirroring `sync/pushResults.test.ts`.
- `practice/persistStoppedPractice.test.ts`: update for the new `authState`
  parameter — asserts the sync push fires when not logged out and is skipped
  when logged out, mirroring `game/persistFinishedLevel.test.ts`'s existing
  coverage of that same branch.

## Out of scope

- Any Practice-side "best record"/summary cache analogous to `level_stats`.
- Any admin view of Practice performance (the admin queries are only being
  *protected* from Practice contamination, not extended to report on it).
- Deriving a real streak or hint budget for Practice trials.
