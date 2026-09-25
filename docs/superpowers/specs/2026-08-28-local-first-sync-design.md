# Local-first sync design

Status: revised design, pending implementation. This text supersedes the
original 2026-08-28 version, which was written against a codebase that no
longer exists: `dbbad77` ("Move sync/stats to a backend-authoritative model")
deleted the localStorage history modules (`storage/trialHistory.ts`,
`storage/practiceHistory.ts`, `storage/levelStats.ts`,
`sync/syncLevelStatsFromRemote.ts`) and the `level_runs`, `level_stats`, and
`trial_keystrokes` tables this spec was built around — while also
implementing several of its backend changes (client-generated `TEXT` ids on
`trial_results`, `INSERT OR IGNORE` dedup, server-side re-evaluation). What
follows is the same design direction re-grounded in the current code.

## Problem

A finished Level or stopped Practice session produces `TrialResult[]` in
memory and immediately hands it to a fire-and-forget push
(`src/sync/pushResults.ts`, `src/sync/pushPracticeResults.ts` →
`Api.syncResults` → `POST /sync/results`). If the device is offline — or the
backend unreachable — the run is gone forever from the server's perspective.
There is no local persistence of trials at all anymore, so nothing about the
run survives a reload either.

Two latent bugs make "just retry the same push later" insufficient:

- `pushResults`/`pushPracticeResults` call
  `toTrialResultInputs(results, policy, Date.now())` **at push time**, so
  both the trial ids and the `playedAt` timestamps
  (`computePlayedAtTimestamps` walks backwards from `now` by each trial's
  `timeTaken`) are minted when the network happens to be available, not when
  the Level was actually finished. A deferred send would stamp a weekend of
  offline play with Sunday-night timestamps. Anything queued must be
  serialized as fully-formed `TrialResultInput[]` **at finish/stop time** —
  the wire shape is the durable record, not the in-memory `TrialResult[]`.
- Pushes can also drop while a session simply doesn't exist yet
  (`logged-out` + backend down at boot). Anonymous-first means results must
  queue with no session at all and flush whenever `ensureSession` later
  succeeds.

Beyond losing data, nothing is playable offline today in the strict sense:
`/level/[levelNumber]` is a Server Component that fetches the Level mix, the
catalog, and LevelStats from the backend per render, and Stats/Levels/Home
all render only what the backend just answered. Local-first means the game
itself — not only the data queue — works without the network.

Goal, restated: a player can play entirely offline (Level or Practice), and
once the device reconnects — or logs in — everything pending gets pushed and
anything new from the server gets pulled, without ever blocking or
interrupting gameplay.

## Constraints and prior decisions

- **ADR-0001 stands**: no sync framework (Jazz was rejected; the earlier
  branch-local ADR also ruled out RxDB replication, document CRDTs, and
  Postgres-coupled sync engines). The mechanism here is a durable IndexedDB
  **outbox** plus idempotent append-only replication over the existing
  Fastify + `node:sqlite` backend. TinyBase remains the selected local store
  (plain `Store` + IndexedDB persister — explicitly not its
  MergeableStore/Synchronizer); it is a storage choice, not a sync engine.
- **The backend is the source of truth and re-validates evidence**: the
  sync endpoint (today `POST /sync/results`, phase 5's unified
  `POST /sync`) re-derives `correct`/`timeExceeded` via
  `engine.evaluateTrialResult` — unchanged. The client never sends those
  fields; locally-computed copies exist only for offline display and are
  overwritten by pulled rows.
- **Idempotent push**: `INSERT OR IGNORE` on `trial_results.id` (already a
  client-generated UUIDv4) makes retries and duplicate deliveries free.
- **Anonymous-first**: `POST /auth/device` mints a session from the stable
  localStorage `deviceId` without an email; queuing must not require a
  session, and a `401` mid-flush is recoverable by re-minting (same
  `deviceId` → same `email_hash`).
- **Self-hosted, single-user, single origin**: nginx fronts frontend and
  backend on one origin (`/` → Next, `/api/*` → Fastify), deployed via
  docker-compose behind Cloudflare Tunnel. Data volumes are small (thousands
  of rows, one player); no pagination, no multi-writer conflict handling, no
  per-tab coordination is warranted.
- **Any new UI copy** (e.g. a pending-sync affordance) goes through
  next-intl with sentence-case `en`/`es` messages — same as the rest of the
  UI.

## Target architecture

One local store (`src/storage/store.ts`, TinyBase `Store` persisted to
IndexedDB `moravec-local`), holding both the outbox and the read model — a
single `trials` table does both jobs because a pending row and a pulled row
are the same shape:

| Data                                              | Local store                                                                      | Server                         | Direction                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| `users`/`otp_codes`/`sessions`                    | never (cookie + `deviceId` bootstrap identity only)                              | truth                          | none                                |
| `trial_results` (Level + Practice via `run_type`) | `trials` table = pending outbox **+** pulled mirror, `synced` flag per row       | truth                          | push `synced:false`, pull by cursor |
| `keystrokes` (phase 6, #68)                       | cell on each pending trial row, JSON                                             | JSON column on `trial_results` | push only — never pulled back       |
| `levels` catalog                                  | `levels` table (last-known mix per level number) + current number list in Values | truth                          | pull wholesale, unauthenticated     |
| `LevelStats`                                      | derived on read via `engine.deriveLevelStats` over local level trials            | derived the same way for SSR   | never a stored entity               |
| sync cursor                                       | `cursor` Value                                                                   | `sync_log.seq`                 | —                                   |

`trial_results` is append-only and every row carries a client-generated id,
so the only "conflict" is id-existence, resolved by `INSERT OR IGNORE`
server-side and id-keyed `setRow` client-side. No CRDT, no merge.

## Phase 1 — Durable outbox of fully-formed inputs

The outbox write happens inside the existing terminal-state seams —
`persistFinishedLevel.ts` (Level finish) and `persistStoppedPractice.ts`
(Practice stop), invoked from the `watchStoreTransition` edge callbacks in
`LevelPlay.tsx`/`PracticePlay.tsx`. Because those run synchronously on the
transition, `Date.now()` there **is** the finish instant — this is exactly
where `toTrialResultInputs` must run, not inside a later flush.

Per finish/stop:

1. `toTrialResultInputs(results, policy, finishedAt)` → `TrialResultInput[]`
   (ids, `runId`, `playedAt` all frozen now).
2. Write one `trials` row per input, keyed by `input.id`, `synced: false`,
   plus display-only fields `correct`/`timeExceeded` taken from the
   `TrialResult` (client-evaluated; replaced by server values on pull).
   TinyBase cells are flat string/number/boolean: `operands` and
   `keystrokes` are JSON strings, `answer: null` and Practice's
   `levelNumber: null` are stored as _absent_ cells (re-hydrated to `null`
   on read — the same convention the prior implementation used).
3. Kick `sync()` (phase 2) — fire-and-forget, never awaited by UI.

Steps 1–2 are unconditional and synchronous: they run for any auth state,
including `logged-out` with the backend unreachable — anonymous-first means
the queue must not depend on a session existing. Today's persist functions
try `ensureSessionToken()` _before_ pushing; that lazy-session attempt moves
inside the flush path instead, so a finished run is always durably queued
first and only then pushed if/when a token exists.

Rows are validated against `engine.TrialResultSchema` at enqueue time: a
row that can't pass the server's own schema must fail loudly at write time
rather than poison the queue and get `400`ed forever once online. For the
same reason, wire-schema evolution must stay additive/optional (see phase
6): a queued row written by build N must still validate when flushed by
build N+1 — the durable payload is the wire contract.

The old push helpers' signatures narrow accordingly: the persist functions
stop passing raw `results`+`runId` for downstream serialization, and the
sync path consumes stored `TrialResultInput`s verbatim. `persistFinishedLevel`
keeps its existing immediate/`refreshed` record contract, with `refreshed`
now resolving after a successful _flush_ — re-derived from the local store
once phase 5 lands (the pull response already brings other devices' rows
down); until then it keeps today's post-push `GET /sync/level-stats` fetch.

Residual gap accepted: `results` live in the zustand store, so a tab crash
in the same tick as the finish transition — before the persister commits —
still loses the run. That window is milliseconds and strictly smaller than
today's "lost whenever offline"; closing it further would mean persisting
every Reviewing transition, which this design deliberately doesn't require.

## Phase 2 — Flush engine and triggers

`src/sync/syncEngine.ts` — one `sync()` function (the prior implementation's
shape still applies; notable behaviors preserved):

- Every attempt first awaits `initLocalStorePersistence()` — the
  memoized hydration of the store from IndexedDB. A boot-time or `online`
  call can fire before hydration finishes; reading the store earlier sees
  it empty and silently skips rows that are actually on disk. (This was a
  real bug found on the prior branch, not a hypothetical.)
- Read `synced:false` rows, map to `TrialResultInput`, send up to
  `MAX_SYNC_TRIALS` (1000) per request; if more remain after a success,
  flush again immediately.
- On `401`: clear the session and re-mint via `ensureSession` once
  (`deviceId` maps back to the same anonymous identity), retry once.
- On success: flip pushed rows to `synced:true`, apply pulled rows,
  store the new cursor (phase 5; until then the pull payload is empty).
- On failure: no state change; schedule retry.
- Backoff is in-memory only — module-level counter + timer, exponential
  ~1s → 30s cap with ~20% jitter, reset to immediate on every fresh
  trigger below. Page reload doesn't preserve retry count because boot is
  itself a trigger.

`navigator.onLine` / the `online` event are **hints to attempt**, never a
gate — a captive portal or a dead backend behind a healthy network reads as
"online", and the backoff loop driven by real request outcomes is the
actual retry authority.

Triggers:

1. **Level finish / Practice stop** — the phase-1 enqueue's kick.
2. **`window` `online`** — if `logged-out`, `ensureSession()` first, then
   `sync()`. `AuthBoot` already owns an `online` listener for session
   retries; this extends that site rather than adding a parallel one.
3. **Boot** — after `hydrate()` + `ensureSession()` settle in `AuthBoot`
   (covers "reload while back online").
4. **Any transition into a tokened state** — one
   `watchStoreTransition(authStore, …)` subscription firing `sync()`
   whenever `state.token` appears or changes. This single trigger covers
   lazy `ensureSessionToken()` recovery, anonymous minting, and OTP login —
   plus a cursor reset on the login transition (see merge section).
5. **Backoff loop** — reschedules itself while pending rows exist or the
   last attempt failed; stops after a successful flush that empties the
   queue.
6. **Logout** — snapshot the pending rows, `resetLocalData()` immediately
   (clear tables and Values), then push the snapshot under the dying token
   (bounded, best-effort). Wipe-first ordering: emptying the queue before
   the push means the re-minted anonymous session's own flush can't claim
   account rows, mid-flight pull-merges can't resurrect them (epoch guard),
   and rows enqueued by the next session land post-wipe untouched. Pending
   trials must not survive into a different account on a shared browser —
   a failed push accepts loss rather than leaking rows across identities.

Non-goal: closed-tab background sync (Background Sync API) — sync runs only
while a tab is open.

## Phase 3 — Local read model

The local `trials` table already contains everything the player-facing UI
derives — for pending rows, plus every pulled row. After hydration, the
local store is the live source for stats and gating; server-fetched props
become first-paint `initialData` only.

- `loadLevelStats()`: `deriveLevelStats` (the same engine fold the backend
  uses for `GET /sync/level-stats`) over local `runType:"level"` rows →
  `Record<levelNumber, LevelStats>` feeding `LevelsList`,
  `isLevelUnlocked`, and `LevelPlay`'s `previousRecord`. Completing a Level
  offline unlocks the next one immediately, since pending rows count.
- `StatsScreen`: swap `useQuery(Api.fetchTrials)` for local rows (works
  offline verbatim — `computeStats`, the operand heatmap, weekly trend,
  activity calendar, and CSV/JSON export all already run client-side over
  `SyncedTrial`-shaped rows).
- Home's "days trained" counter: `daysTrainedThisMonth` over local
  `playedAt` — same computation as `/sync/activity`, no request needed.
- A `StoreBoot` gate (prior art) wraps the app so no read path mounts
  before IndexedDB hydration — same race as the sync engine's, on the read
  side.

Level/Practice stats stay unmerged (filter by `runType` on read) — an
unchanged presentation rule, not a storage decision.

`GET /sync/level-stats`, `GET /sync/trials`, and `GET /sync/activity`
remain for the SSR paths (`/level/[n]` page gating, `/levels` first paint)
that still fetch server-side — nothing removes them; the UI just stops
_depending_ on them.

## Phase 4 — Level catalog snapshot + offline app shell

Two halves; the first alone already makes an _open_ tab fully playable
offline, the second survives a cold navigation while offline.

**(a) Catalog snapshot.** New public endpoint `GET /levels/all` →
`{levels: [{levelNumber, mix}]}` (prior art's exact shape — the whole
catalog in one read; mixes are already JSON blobs). Cached into the local
`levels` table plus the current number list, refreshed on boot and on every
successful sync — the catalog is backend-authoritative and can change, so
the snapshot is a cache, not a mirror that deletes: mixes for numbers no
longer in the catalog are kept locally (history references them; sync
already accepts level numbers above the active catalog by design), while
the number list — what `/levels` renders and what `nextLevelNumber` derives
from — tracks the server's answer wholesale.

**(b) Offline data path + service worker.** `/level/[n]` currently fetches
mix, catalog, and stats in a Server Component — unreachable offline _and_
when the frontend is up but the backend isn't. The fetch-failure path
follows the rxdb branch's `fetchLevelForPage` precedent: classify
found/not-found/unreachable; on unreachable, render the same `LevelPlay`
with level/stats/nextLevelNumber sourced from the local store (unlock gate
applied locally via `isLevelUnlocked`). For the whole-origin-unreachable
case, a small hand-rolled service worker (`public/sw.js`, registered from a
boot component): `/_next/static/*` cache-first (content-hashed),
navigations network-first → per-URL cached document (a previously visited
Level replays verbatim) → a cached app-shell document whose client code
routes by `location.pathname` to the local-data versions of the play/stats
screens; `/api/*` bypasses the cache entirely — sync calls must hit the
network or fail honestly. In dev, API calls are cross-origin
(`localhost:3000`) and never intersect the SW anyway.

Practice needs nothing in this phase — `/practice/[mode]` validates against
`SUPPORTED_CATEGORY_CODENAMES` client-side already.

## Phase 5 — Unified `POST /sync` with `sync_log`

Single endpoint replacing `POST /sync/results` as the sync path
(self-hosted, both ends deployed together — no compatibility alias kept).
`GET /sync/*` read endpoints are unaffected.

```ts
// POST /sync — request
{ cursor: number;               // last seq this device saw, 0 initially
  trials: TrialResultInput[] }  // outbox rows, serialized at finish time

// POST /sync — response
{ cursor: number;               // max seq observed for this user
  trials: SyncedTrial[] }       // this user's trial_results rows with seq > cursor
```

New table (additive in `db.ts`, plus index):

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sync_log_email_seq ON sync_log(email_hash, seq);
```

Simpler than the original spec's polymorphic `(entity_type, entity_id)`
log — `level_runs` no longer exists as a synced entity, so the log records
trial inserts only. One **backfill** is required so history predating the
table is still pullable by a fresh device: `INSERT INTO sync_log
(email_hash, trial_id, created_at) SELECT email_hash, id, played_at FROM
trial_results ORDER BY rowid`.

Request handling, in one `BEGIN IMMEDIATE` transaction (the current per-row
autocommit becomes atomic here — required anyway, since a sync_log entry
must exist iff its row insert happened):

1. `emailHash` from the Bearer token, never the body (unchanged rule).
2. Validate `cursor` as a non-negative integer (`Number.isInteger` — rejects
   NaN/Infinity) and `trials` against the existing schema, extended into a
   `SyncRequestSchema` in `engine/logic.ts` next to `TrialResultsSchema`.
3. `evaluateTrialResult` per input → `INSERT OR IGNORE`; append a
   `sync_log` row only where `.changes > 0` — a retried push of a known id
   must not grow the log or the device sees its own data as "new" forever.
4. `SELECT … FROM sync_log WHERE email_hash = ? AND seq > ?`, minus this
   request's own pushed ids (cheap in-memory exclusion — bandwidth only;
   correctness doesn't depend on it since applying them is idempotent).
5. Respond `{cursor: max(seq) for this user (or the requested cursor),
trials: full SyncedTrial rows for the remaining ids}`.

Pull responses carry the full `SyncedTrial` row — including `operands` and
`answer`, which the Stats detail views (heatmap, confusions) and the export
feature read. They exclude `keystrokes` (phase 6): nothing local consumes a
trace this device didn't record, same reasoning that stripped them from
pulled rows in the prior implementation.

Until this phase lands, phases 1–4 already ship real value against the
existing `POST /sync/results` (push-only, `cursor` ignored client-side) —
the unified endpoint upgrades pull to incremental and merges both
directions into one round trip.

### Anonymous → login merge

`completeOtpVerification` (`auth/repo.ts`) already re-keys
`trial_results.email_hash` inside its transaction; add the same
`UPDATE sync_log SET email_hash = ?` — otherwise merged rows would be
invisible to incremental pull (`WHERE email_hash = ? AND seq > ?` never
sees them) even though `GET /sync/trials` finds them fine.

Client-side, the login transition **resets `cursor` to 0** before the first
sync under the new token — not optional: `sync_log.seq` is one global
sequence shared across users, so an anonymous device's cursor can land
numerically above the destination account's pre-existing history, and
`seq > cursor` would skip it permanently. A full re-pull at this scale is
cheap and is what the shipped prior implementation settled on after hitting
this. Rows already on the device are `setRow`-idempotent, so the re-pull is
a merge, not a wipe.

## Phase 6 — Keystroke evidence (#68)

Rides the phase-1 transport; adds no new sync machinery.

- **Capture**: `AnsweringPanel.handleButton` is the single funnel for the
  on-screen keypad and physical keyboard — collect `{key, t}` pairs there
  (`t` = ms since the Answering phase's `startedAt`), carried on
  `TrialResult` to the persist seams.
- **Wire**: `keystrokes` as an **optional** field on `TrialResultSchema`
  (`z.array({key, t}).max(bound)` — a few hundred entries; a real trial is
  ≤ ~10 digits plus erases). Optional, not defaulted-required, so phase-1
  outbox rows written before this ships still flush.
- **Storage**: one `keystrokes` JSON column on `trial_results` via
  `COLUMN_MIGRATIONS`, stored verbatim like `operands` — no per-row
  `trial_keystrokes` table this time (that shape died with `dbbad77` and
  normalized access to it has no consumer). Evidence, not derived data —
  the server doesn't recompute anything from it.
- **Never pulled**: excluded from `/sync` responses — nothing local reads
  another device's trace, so they're server-side storage only. A locally
  recorded row simply keeps its own (bounded) copy; no consumer is fine.
- **Consumer**: `packages/analysis` derives an `erased_digit`/edit flag
  (any `⌫`/`C` event) closing the DATA_GAPS.md exclusion gap.
- **Privacy**: per-key timing is behavioral data collected for research —
  disclosing it (and whether personal data export #70 should include
  traces) is a product decision flagged in Open questions; the transport
  itself is identical to today's trial sync, authenticated per session.

## Testing

Same repo conventions — TDD, per-module backend tests, frontend tests
against a real in-memory TinyBase store with a mocked `Api` (no store
mocking), jsdom storage tests via the existing `localStorageMock` pattern.

- Phase 1/2: enqueue-at-finish freezes ids/`playedAt` (advance the clock
  between finish and flush; the pushed payload must carry finish-time
  values); outbox survives store rehydration; flush marks only acknowledged
  rows synced; backoff timing under fake timers; `401` → re-mint → retry
  once; triggers fire from finish/stop/`online`/boot/token-change.
- Phase 3: `deriveLevelStats` over local rows matches `GET
/sync/level-stats` output for the same data; pending rows count toward
  unlock; Stats renders offline.
- Phase 4: `/levels/all` returns the whole catalog; unreachable-backend
  level page renders from snapshot; removed-catalog numbers stay playable.
- Phase 5: `sync_log` grows only on real inserts; push+pull in one round
  trip; own-push exclusion; cursor advance; `completeOtpVerification`
  re-keys `sync_log`; cursor-0 re-pull returns merged history.
- Phase 6: keystrokes round-trip to a JSON column; over-bound arrays
  rejected; absent `keystrokes` on old queued rows still validates.

## Open questions

- **Pending-state UI**: does anything surface "N results awaiting sync"
  (Stats/Levels empty states are candidates)? If so, en/es sentence-case
  keys.
- **Keystroke disclosure**: what consent/privacy copy (if any) accompanies
  collecting keystroke timing, and should the personal export include them.
- **SW ambition**: full cold-offline navigation is the most novel piece
  here; "open-tab offline play" (phases 1–4a) may be an acceptable v1
  boundary to ship first.
- **Catalog deletions**: keep cached mixes for numbers dropped from the
  catalog (spec'd: yes, for history replay) vs. strictly mirroring deletes.
- **Multi-tab**: concurrent pushes are accepted as harmless (idempotent
  both directions); no leader election.

## Prior art on branches (reference only — do not restore)

- `origin/refactor/offline-first` — full implementation of the _old_
  version of this spec: unified `POST /sync` + `sync_log`, TinyBase store +
  `StoreBoot` + `warmLevelCache` + `/levels/all`, `syncEngine.ts` with the
  backoff/hydration/login/logout behaviors quoted above. Its wire model
  (keystrokes, `client_correct` audit columns, `streakAtSubmit`,
  `level_runs` rows) predates `dbbad77` and doesn't map to today's schema.
- `origin/worktree-offline-sync-backend-api` — earlier parallel cut:
  `run_trial_id` client column over autoincrement ids, per-table
  `server_seq` cursors, `GET /sync/pull`, FK enforcement; also holds
  branch-local ADR-0001 with the sync-tooling option analysis (RxDB /
  Automerge / ElectricSQL / Jazz / Dexie → TinyBase plain Store).
- `origin/feature/rxdb-local-first` — the rejected RxDB pilot; still useful:
  `fetchLevelForPage`'s found/not-found/unreachable tri-state fallback
  (ticket 02) and its plain-HTTP/insecure-context findings for LAN deploys.
- `origin/2026-08-22-research-platform-work` — the world the old spec
  described: localStorage `trialHistory`/`practiceHistory` (2000-cap),
  `trial_keystrokes` + `{key,t}` on the wire, `level_runs`/`level_stats`
  tables, and branch-only ADRs 0003/0004 arguing keystrokes-as-research-
  signal — the reasoning phase 6 inherits.
