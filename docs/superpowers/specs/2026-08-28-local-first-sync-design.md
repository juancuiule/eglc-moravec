# Local-first sync design

Status: approved, pending implementation plan.

## Problem

Sync today (`POST /sync/results` push on Level-finish/Practice-stop, `GET
/sync/level-stats` pull on OTP login) is fire-and-forget with no retry: a
push that fails because the device is offline is gone from the server's
perspective forever, even though the trial stays in the player's local
history. There's also no way for a device to pick up Level/Practice history
recorded on another device — only best-ever `LevelStats` per level comes
down, and only right after logging in with OTP.

Goal: a player can play entirely offline (Level or Practice), and once the
device reconnects — or logs in — everything pending gets pushed and
anything new from the server gets pulled, without ever blocking or
interrupting gameplay.

## Scope decisions (already made, not open for re-litigation in the plan)

- **Full bidirectional history sync**, not just a reliable push: a device
  also pulls `trial_results`/`level_runs` it doesn't have yet, not only
  best-ever `LevelStats`.
- **TinyBase** is the local store (mergeable, IndexedDB-backed), replacing
  the hand-rolled `localStorage` modules for trial/level-run history.
- **Sync triggers**: Level-finish, Practice-stop (unchanged), plus a new
  `online` listener and an in-memory backoff retry loop — no reliance on
  the player reloading the page to retry.
- **No row caps.** The existing 2000-row cap on `trialHistory`/
  `practiceHistory` existed because of `localStorage`'s ~5-10MB ceiling;
  TinyBase/IndexedDB doesn't have that constraint, so nothing is pruned.
- **Backend data reset is acceptable.** The schema changes below aren't
  migratable from the current `trial_results.id` (autoincrement `INTEGER`)
  to a client-generated `TEXT` id. Existing rows in the dev SQLite DB are
  dropped, not migrated. Any SQL migration logic predating this design is
  removed, not preserved for backward compatibility.
- **`level_stats` table is deleted outright.** Confirmed via
  `apps/backend/src/admin/repo.ts` that admin stats only ever query
  `trial_results` directly — nothing else depends on it.

## Responsibilities

| Data | Local (TinyBase) | Server | Sync |
|---|---|---|---|
| `users`, `otp_codes`, `sessions` | never | source of truth | never |
| `trial_results` (Level + Practice, discriminated by `runType`) | yes | source of truth | push + pull |
| `level_runs` | yes | source of truth | push + pull |
| `LevelStats` | derived on read from local `level_runs` | removed as a stored entity | not synced directly |
| sync cursor | yes (TinyBase Values) | derived from `sync_log` | — |

`trial_results` is append-only and every row has a client-generated id, so
there's no CRDT-style merge to design: the only conflict is "does this id
already exist," resolved by `INSERT OR IGNORE` server-side and `setRow`
(overwrite-by-id, naturally idempotent) client-side.

## Backend schema changes

Applied directly as the new schema shape in `apps/backend/src/db.ts` — no
`COLUMN_MIGRATIONS`/`ensureRunIdColumn`-style compatibility layer for
anything predating this design.

- `trial_results.id`: `INTEGER PRIMARY KEY AUTOINCREMENT` → `TEXT PRIMARY
  KEY` (a UUID generated client-side, same pattern `level_runs.id` /
  `runId` already uses). This is what makes push idempotent without the
  server needing to hand back generated ids.
- `trial_keystrokes.trial_result_id`: `INTEGER` → `TEXT`, to match.
- `level_runs.id`: unchanged — already a client-generated `TEXT`.
- New table:
  ```sql
  CREATE TABLE sync_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,   -- 'trial_result' | 'level_run'
    entity_id TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
  ```
  A row is appended only when an `INSERT OR IGNORE` actually inserted (check
  `.changes` on the `node:sqlite` `RunResult`, not just "ran without
  error") — a retried push of an id that already exists must not grow the
  log.
- `level_stats` table: deleted. `GET /sync/level-stats` route: deleted.

## Sync protocol

Single endpoint, replacing `POST /sync/results` and `GET
/sync/level-stats`:

```ts
// POST /sync — request
{
  cursor: number;                  // last seq this device has, 0 initially
  trials: SyncTrialInput[];        // local rows with synced=false (any runType)
  levelRuns: SyncLevelRunInput[];  // local rows with synced=false
}

// POST /sync — response
{
  cursor: number;                   // new cursor after this exchange
  trials: SyncTrialOutput[];        // this user's rows with seq > requested cursor
  levelRuns: SyncLevelRunOutput[];  // same, for level_runs
}
```

`SyncTrialInput` now carries `id` explicitly (today's `SyncTrial` type in
`Api.ts` doesn't — the id used to be server-generated). This is the field
`INSERT OR IGNORE` dedupes on, so its absence would break idempotency, not
just be an oversight.

Pulled trials (`SyncTrialOutput`) omit `keystrokes` — nothing locally reads
keystrokes for a trial it didn't itself record (they exist for
research-signal storage server-side, not for local consumption), so
there's no reason to spend bandwidth sending them back down. A pulled row
is stored locally with `keystrokes: "[]"`.

Server-side, in one transaction:

1. Resolve `emailHash` from the Bearer token — never from the body (this is
   already the rule today; unchanged).
2. Re-evaluate each trial's correctness via `engine` (unchanged), insert
   with `INSERT OR IGNORE` on `id`.
3. Derive `level_runs` from the just-processed trials where `runType ===
   "level"` (unchanged filter — Practice never produces a `level_run`),
   insert with `INSERT OR IGNORE` on `id`.
4. For every row that was actually inserted in steps 2-3, append a
   `sync_log` entry.
5. Query `sync_log WHERE email_hash = ? AND seq > cursor`, excluding
   `entity_id`s that appeared in this same request's own push (cheap
   in-memory filter — avoids echoing a device's own just-pushed data back
   to it; omitting this filter would still be correct, just wasteful).
6. Respond with the full rows for whatever `entity_id`s remain, and the new
   cursor (`max(seq)` observed, or the requested cursor unchanged if
   nothing new).

This collapses push and pull into one round trip, which is what "reconnect
and sync" needs — no separate orchestration of two calls.

## Anonymous → login merge

`mergeAnonymousIdentity` (`apps/backend/src/sync/repo.ts`) already re-keys
`trial_results.email_hash` and `level_runs.email_hash` from the anonymous
identity to the newly-verified one. Add one more re-key:

```ts
db.prepare("UPDATE sync_log SET email_hash = ? WHERE email_hash = ?").run(to, from);
```

This keeps a device's already-stored local cursor numerically valid across
the anonymous→login transition — no client-side special case, no forced
full re-pull after login.

Separately, a successful OTP verification still triggers a full `sync()`
call with the new token — not because the cursor needs resetting, but
because there may be local rows still `synced: false` that never made it
out under the anonymous token (e.g. played offline before ever logging
in).

## Local store (TinyBase)

One store, two tables, mirroring the backend's own shape rather than
re-deriving a different one:

```ts
trials: {
  [id: string]: {                    // client-generated UUID
    runType: "level" | "practice";
    levelNumber: number | null;      // null for practice
    categoryCodename: string;
    correct: boolean;
    timeExceeded: boolean;
    timeTaken: number;
    playedAt: number;
    keystrokes: string;              // JSON.stringify — TinyBase cells are flat
    hintShown: boolean;
    streakAtSubmit: number;
    hintsAvailableAtStart: number;
    runId: string;
    synced: boolean;                 // false = pending push
  }
}

levelRuns: {
  [id: string]: {                    // the existing client-generated runId
    levelNumber: number;
    stars: number;
    totalTime: number;
    levelCompleted: boolean;
    playedAt: number;
    synced: boolean;
  }
}

// Values (not a table)
cursor: number;
```

Rows pulled from the server are inserted with `synced: true` (they're
already the server's own record — never re-pushed). `setRow` by `id` is
inherently idempotent, so re-receiving anything is harmless, just wasted
bandwidth (mitigated by the exclusion in protocol step 5).

Consumers keep their existing public shape:

- `loadTrialHistory()` / `loadPracticeHistory()` (used by `StatsScreen`,
  `computeStats.ts`) keep their current signatures — internally, they
  filter the single `trials` table by `runType` instead of reading two
  separate `localStorage` keys. This preserves the existing "Practice and
  Level stats stay unmerged" presentation decision; it was never a storage
  decision.
- `persistFinishedLevel.ts` / `persistStoppedPractice.ts` write into this
  same table (`synced: false`) instead of the two old `localStorage`-backed
  histories.
- `loadLevelStats()` (used by `LevelsList`) is **derived on every read**,
  not cached: group local `levelRuns` by `levelNumber`, fold with
  `isBetterLevelRecord` (existing `engine` function) per group. No stored
  `LevelStats` snapshot, so nothing can drift out of sync with `levelRuns`
  — the exact bug class a cache would introduce. This also fully replaces
  what `GET /sync/level-stats` used to provide.

## Sync engine and triggers

One `sync()` function (new `apps/frontend/src/sync/syncEngine.ts`):

1. Skip entirely if `authState.type === "loggedOut"`.
2. Read all `trials`/`levelRuns` rows with `synced: false`, and the current
   `cursor` value.
3. `POST /sync` with that payload.
4. On success: mark the pushed rows `synced: true`; `setRow` every row in
   the response (push and pull both land through the same idempotent
   write path); store the new `cursor`.
5. On failure: no state change, schedule a retry.

Backoff is in-memory only (module-level counter + timer handle), not
persisted — a full page reload doesn't need to preserve retry count, since
boot itself triggers a fresh attempt. Exponential, capped around 30s,
jittered; reset to 0 whenever a trigger below fires so a fresh reason to
sync always gets an immediate attempt rather than waiting out a stale
backoff.

Triggers:

1. **Level finished / Practice stopped** — same call sites as today
   (`persistFinishedLevel.ts`, `persistStoppedPractice.ts`), fire-and-forget.
2. **`window` `online` event** — if still `loggedOut` (session couldn't be
   minted while offline), retry `ensureSession()` first, then `sync()`.
3. **App boot** — one attempt in `AuthBoot` (extended, not a new
   component) right after `ensureSession()` resolves, covering "reload
   while already back online."
4. **OTP login success** — explicit flush with the new token (see merge
   section above).
5. **Backoff loop** — keeps rescheduling itself while pending rows exist or
   the last attempt failed; stops once a `sync()` call both empties the
   pending set and succeeds.

Explicit non-goal: this only syncs while the tab is open. Background sync
with the app closed (Service Worker + Background Sync API) is a separate
project, not part of this design.

## Testing

Backend (extend existing per-module test files, matching this repo's
existing logic/repo/route split):

- `sync/logic.test.ts`, `sync/repo.test.ts`: `sync_log` only grows on a
  real insert, never on an `OR IGNORE` no-op; `mergeAnonymousIdentity`
  re-keys `sync_log.email_hash` alongside the existing tables.
- `routes/sync.test.ts`: the unified endpoint's push+pull in one call, and
  that a device never gets its own just-pushed rows echoed back.

Frontend:

- `syncEngine` tests against a real in-memory TinyBase store (no TinyBase
  mocking) with a mocked `Api`: verifies `synced` flips, `setRow` on pulled
  data, cursor advances, and backoff scheduling (fake timers).
- `loadTrialHistory` / `loadPracticeHistory` / `loadLevelStats` tests
  against TinyBase fixtures, replacing their current `localStorage`-fixture
  equivalents.

Follows this repo's existing TDD convention — tests written before the
implementation they cover.
