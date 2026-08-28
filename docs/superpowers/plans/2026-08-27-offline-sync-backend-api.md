# Offline Sync Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the backend the two things offline sync needs — idempotent trial writes (safe to retry) and a cursor-based pull endpoint — without changing any existing response shape or requiring a coordinated frontend deploy.

**Architecture:** Two additive schema changes (a client-supplied dedup key on `trial_results`, a server-assigned monotonic `server_seq` on `level_runs`) plus one new `GET /sync/pull` route that reads anything newer than a client-supplied cursor. `POST /sync/results` keeps its exact current response shape; only its internal insert behavior changes (a retried batch with the same dedup key no longer double-inserts).

**Tech Stack:** Fastify, `node:sqlite` (`DatabaseSync`), vitest. No new dependencies.

**Spec:** `docs/adr/0001-local-first-sync-append-only-tinybase.md`

## Global Constraints

- Every schema change must be additive and idempotent, matching this file's existing style exactly: a column in `SCHEMA_STATEMENTS`'s `CREATE TABLE` (for fresh databases) plus a matching entry in `COLUMN_MIGRATIONS` (for existing ones) — never a table rebuild, never a destructive `ALTER`.
- `TrialResultInput`'s new field (`trialId`) is **optional** — existing callers that omit it must keep working exactly as today, just without dedup.
- `POST /sync/results`'s JSON response shape does not change in this plan. Do not add fields to it — existing tests assert exact equality (`toEqual`) on it.
- Run backend tests with `pnpm --filter backend exec vitest run <path>` from the repo root.
- Explicit non-goal, deferred to a follow-up plan: real `FOREIGN KEY` constraints / `PRAGMA foreign_keys = ON` (ADR-0001's Consequences section). That requires a full table-rebuild migration (SQLite can't `ALTER TABLE ADD CONSTRAINT`), which is a materially different, riskier piece of work than this plan's additive changes — deliberately not bundled in here.

---

### Task 1: `trial_results.run_trial_id` — client-supplied dedup key

**Files:**
- Modify: `apps/backend/src/db.ts:31-49` (CREATE TABLE + COLUMN_MIGRATIONS)
- Test: `apps/backend/src/db.test.ts`

**Interfaces:**
- Produces: a `run_trial_id TEXT NOT NULL DEFAULT ''` column on `trial_results`, plus a unique index `trial_results_run_trial_id_idx` on `(run_trial_id)` scoped to non-empty values (`WHERE run_trial_id != ''`) — later tasks read/write this column.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/db.test.ts — add inside the existing describe("openDb", ...) block
it("creates trial_results with run_trial_id on a fresh database", () => {
  const db = openDb(":memory:");
  const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  expect(columns).toContain("run_trial_id");
});

it("enforces uniqueness on a non-empty run_trial_id", () => {
  const db = openDb(":memory:");
  db.prepare(
    `INSERT INTO trial_results
       (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, run_trial_id)
     VALUES ('hash-1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000, 'dedup-key-1')`,
  ).run();

  expect(() =>
    db
      .prepare(
        `INSERT INTO trial_results
           (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, run_trial_id)
         VALUES ('hash-1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000, 'dedup-key-1')`,
      )
      .run(),
  ).toThrow();
});

it("allows multiple rows with an empty run_trial_id (legacy/un-migrated clients)", () => {
  const db = openDb(":memory:");
  const insert = db.prepare(
    `INSERT INTO trial_results
       (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, run_trial_id)
     VALUES ('hash-1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000, '')`,
  );
  expect(() => {
    insert.run();
    insert.run();
  }).not.toThrow();
});

it("migrates a database that predates run_trial_id, defaulting it to ''", () => {
  tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
  const dbPath = join(tmpDir, "old.sqlite");

  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`CREATE TABLE trial_results (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     category_codename TEXT NOT NULL,
     correct INTEGER NOT NULL,
     time_exceeded INTEGER NOT NULL,
     client_correct INTEGER NOT NULL,
     client_time_exceeded INTEGER NOT NULL,
     time_taken INTEGER NOT NULL,
     played_at INTEGER NOT NULL
   )`);
  legacyDb.exec(
    `INSERT INTO trial_results (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at)
     VALUES ('hash-1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000)`,
  );
  legacyDb.close();

  const migrated = openDb(dbPath);
  const row = migrated.prepare("SELECT run_trial_id FROM trial_results").get() as { run_trial_id: string };
  expect(row.run_trial_id).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend exec vitest run src/db.test.ts`
Expected: FAIL — `run_trial_id` column doesn't exist yet (`no such column`).

- [ ] **Step 3: Add the column to the fresh-install schema**

In `apps/backend/src/db.ts`, add `run_trial_id` to the `trial_results` `CREATE TABLE` statement (after `run_type`):

```ts
  `CREATE TABLE IF NOT EXISTS trial_results (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     category_codename TEXT NOT NULL,
     correct INTEGER NOT NULL,
     time_exceeded INTEGER NOT NULL,
     client_correct INTEGER NOT NULL,
     client_time_exceeded INTEGER NOT NULL,
     time_taken INTEGER NOT NULL,
     played_at INTEGER NOT NULL,
     hint_shown INTEGER NOT NULL DEFAULT 0,
     streak_at_submit INTEGER NOT NULL DEFAULT 0,
     hints_available_at_start INTEGER NOT NULL DEFAULT 0,
     run_id TEXT NOT NULL DEFAULT '',
     run_type TEXT NOT NULL DEFAULT 'level',
     run_trial_id TEXT NOT NULL DEFAULT ''
   )`,
```

- [ ] **Step 4: Add the migration entry for existing databases**

In `COLUMN_MIGRATIONS`, add (after the `run_type` entry):

```ts
  // Offline-sync dedup key (ADR-0001) — '' means "no dedup key", exactly
  // as ungroupable for retry-dedup purposes as every pre-sync row already was.
  {
    table: "trial_results",
    column: "run_trial_id",
    ddl: "ALTER TABLE trial_results ADD COLUMN run_trial_id TEXT NOT NULL DEFAULT ''",
  },
```

- [ ] **Step 5: Add the unique index, run unconditionally after migrations (mirrors `run_id`'s index)**

In `applyColumnMigrations`, after the existing `trial_results_run_id_idx` line:

```ts
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS trial_results_run_trial_id_idx ON trial_results (run_trial_id) WHERE run_trial_id != ''",
  );
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/db.test.ts
git commit -m "feat(backend): add trial_results.run_trial_id dedup key"
```

---

### Task 2: `level_runs.server_seq` — sync pull cursor

**Files:**
- Modify: `apps/backend/src/db.ts:69-79` (CREATE TABLE + COLUMN_MIGRATIONS)
- Test: `apps/backend/src/db.test.ts`

**Interfaces:**
- Produces: a `server_seq INTEGER NOT NULL DEFAULT 0` column on `level_runs`, read/written by Task 4 and Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/db.test.ts
it("creates level_runs with server_seq on a fresh database", () => {
  const db = openDb(":memory:");
  const columns = (db.prepare("PRAGMA table_info(level_runs)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  expect(columns).toContain("server_seq");
});

it("migrates a database that predates level_runs.server_seq, defaulting it to 0", () => {
  tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
  const dbPath = join(tmpDir, "old.sqlite");

  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`CREATE TABLE level_runs (
     id TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     level_completed INTEGER NOT NULL,
     played_at INTEGER NOT NULL
   )`);
  legacyDb.exec(
    `INSERT INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at)
     VALUES ('run-1', 'hash-1', 1, 3, 5000, 1, 1700000000000)`,
  );
  legacyDb.close();

  const migrated = openDb(dbPath);
  const row = migrated.prepare("SELECT server_seq FROM level_runs").get() as { server_seq: number };
  expect(row.server_seq).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend exec vitest run src/db.test.ts`
Expected: FAIL — `server_seq` column doesn't exist yet.

- [ ] **Step 3: Add the column to the fresh-install schema**

In `apps/backend/src/db.ts`, add `server_seq` to the `level_runs` `CREATE TABLE` statement:

```ts
  `CREATE TABLE IF NOT EXISTS level_runs (
     id TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     level_completed INTEGER NOT NULL,
     played_at INTEGER NOT NULL,
     server_seq INTEGER NOT NULL DEFAULT 0
   )`,
```

- [ ] **Step 4: Add the migration entry**

In `COLUMN_MIGRATIONS`, add:

```ts
  // Offline-sync pull cursor (ADR-0001). 0 means "predates cursor sync" —
  // a fresh pull (cursor 0) correctly picks up every such row once, then
  // never again, since new rows always get a real positive value (Task 4).
  {
    table: "level_runs",
    column: "server_seq",
    ddl: "ALTER TABLE level_runs ADD COLUMN server_seq INTEGER NOT NULL DEFAULT 0",
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/db.test.ts
git commit -m "feat(backend): add level_runs.server_seq sync cursor column"
```

---

### Task 3: Idempotent `insertTrialResults`

**Files:**
- Modify: `apps/backend/src/sync/logic.ts` (`TrialResultInput`, `isTrialResultInput`, `EvaluatedTrialResult`, `evaluateTrialResult`)
- Modify: `apps/backend/src/sync/repo.ts:66-100` (`insertTrialResults`)
- Test: `apps/backend/src/sync/repo.test.ts`

**Interfaces:**
- Consumes: `run_trial_id` column + unique index from Task 1.
- Produces: `TrialResultInput.trialId?: string`; `EvaluatedTrialResult.trialId: string | undefined`; `insertTrialResults` becomes idempotent — calling it twice with the same `trialId` on otherwise-identical trials inserts the row (and its keystrokes) exactly once.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/sync/repo.test.ts — add near the other insertTrialResults-adjacent tests
describe("insertTrialResults idempotency", () => {
  it("does not double-insert a trial (or its keystrokes) when retried with the same trialId", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult({ ...baseTrialInput, trialId: "trial-abc" } as TrialResultInput);

    insertTrialResults(db, "hash-1", [trial]);
    insertTrialResults(db, "hash-1", [trial]); // simulated retry

    const rows = getTrialResultsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(getKeystrokesForTrialResult(db, rows[0].id)).toHaveLength(baseTrialInput.keystrokes.length);
  });

  it("inserts every trial normally when trialId is omitted (un-migrated client)", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput); // no trialId

    insertTrialResults(db, "hash-1", [trial]);
    insertTrialResults(db, "hash-1", [trial]); // no dedup key — both inserts land

    expect(getTrialResultsForUser(db, "hash-1")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: FAIL — `trialId` isn't a recognized property yet (TS error) or the retry double-inserts.

- [ ] **Step 3: Add `trialId` to the input/evaluated types**

In `apps/backend/src/sync/logic.ts`:

```ts
export type TrialResultInput = {
  levelNumber: number | null;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: number;
  keystrokes: KeystrokeInput[];
  operands: number[];
  answer: number | null;
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  runId: string;
  runType: "level" | "practice";
  trialId?: string; // client-generated dedup key (ADR-0001) — absent for un-migrated clients
};
```

Update `isTrialResultInput` to accept the optional field:

```ts
function isTrialResultInput(value: unknown): value is TrialResultInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    (r.levelNumber === null || typeof r.levelNumber === "number") &&
    typeof r.categoryCodename === "string" &&
    typeof r.correct === "boolean" &&
    typeof r.timeExceeded === "boolean" &&
    typeof r.timeTaken === "number" &&
    typeof r.playedAt === "number" &&
    Array.isArray(r.keystrokes) &&
    r.keystrokes.every(isKeystrokeInput) &&
    Array.isArray(r.operands) &&
    r.operands.every((o) => typeof o === "number") &&
    (r.answer === null || typeof r.answer === "number") &&
    typeof r.hintShown === "boolean" &&
    typeof r.streakAtSubmit === "number" &&
    typeof r.hintsAvailableAtStart === "number" &&
    typeof r.runId === "string" &&
    (r.runType === "level" || r.runType === "practice") &&
    (r.trialId === undefined || typeof r.trialId === "string")
  );
}
```

Update `EvaluatedTrialResult` and `evaluateTrialResult` to carry it through:

```ts
export type EvaluatedTrialResult = {
  levelNumber: number | null;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  clientCorrect: boolean;
  clientTimeExceeded: boolean;
  timeTaken: number;
  playedAt: number;
  keystrokes: KeystrokeInput[];
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  runId: string;
  runType: "level" | "practice";
  trialId?: string;
};
```

```ts
export function evaluateTrialResult(input: TrialResultInput): EvaluatedTrialResult {
  const operation = reconstructOperation(input.categoryCodename, input.operands);
  const { correct, timeExceeded } = evaluateTrial(operation, input.answer, input.timeTaken);

  return {
    levelNumber: input.levelNumber,
    categoryCodename: input.categoryCodename,
    correct,
    timeExceeded,
    clientCorrect: input.correct,
    clientTimeExceeded: input.timeExceeded,
    timeTaken: input.timeTaken,
    playedAt: input.playedAt,
    keystrokes: input.keystrokes,
    hintShown: input.hintShown,
    streakAtSubmit: input.streakAtSubmit,
    hintsAvailableAtStart: input.hintsAvailableAtStart,
    runId: input.runId,
    runType: input.runType,
    trialId: input.trialId,
  };
}
```

- [ ] **Step 4: Make `insertTrialResults` idempotent**

Replace `insertTrialResults` in `apps/backend/src/sync/repo.ts`:

```ts
import { randomUUID } from "node:crypto";

export function insertTrialResults(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly EvaluatedTrialResult[],
): void {
  // INSERT OR IGNORE on run_trial_id: a real client trialId lets a retried
  // push skip a trial it already stored. When trialId is absent (an
  // un-migrated client), a fresh random key is used so the row is never
  // deduped — same behavior as before this change.
  const insertTrial = db.prepare(
    `INSERT OR IGNORE INTO trial_results
       (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, run_id, run_type, run_trial_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeystroke = db.prepare(
    `INSERT INTO trial_keystrokes (trial_result_id, key, t) VALUES (?, ?, ?)`,
  );
  trials.forEach((t) => {
    const dedupKey = t.trialId ?? randomUUID();
    const result = insertTrial.run(
      emailHash,
      t.levelNumber ?? 0,
      t.categoryCodename,
      t.correct ? 1 : 0,
      t.timeExceeded ? 1 : 0,
      t.clientCorrect ? 1 : 0,
      t.clientTimeExceeded ? 1 : 0,
      t.timeTaken,
      t.playedAt,
      t.hintShown ? 1 : 0,
      t.streakAtSubmit,
      t.hintsAvailableAtStart,
      t.runId,
      t.runType,
      dedupKey,
    );
    // changes === 0 means INSERT OR IGNORE skipped a duplicate — its
    // keystrokes were already stored on the first, non-retried insert.
    if (result.changes === 0) return;
    t.keystrokes.forEach((k) => {
      insertKeystroke.run(result.lastInsertRowid, k.key, k.t);
    });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: PASS

Also run the full backend suite to confirm nothing else broke:

Run: `pnpm --filter backend test:run`
Expected: PASS (existing `routes/sync.test.ts` tests still pass unmodified — `trialId` is optional, so their payloads without it behave exactly as before)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/sync/logic.ts apps/backend/src/sync/repo.ts apps/backend/src/sync/repo.test.ts
git commit -m "feat(backend): make insertTrialResults idempotent via trialId dedup key"
```

---

### Task 4: `insertLevelRuns` assigns `server_seq`

**Files:**
- Modify: `apps/backend/src/sync/repo.ts:142-179` (`LevelRunRow`, `insertLevelRuns`)
- Test: `apps/backend/src/sync/repo.test.ts`

**Interfaces:**
- Consumes: `server_seq` column from Task 2.
- Produces: every row `insertLevelRuns` actually inserts (not skipped as a duplicate) gets a `server_seq` one higher than the current max for that table — read by Task 5's `getLevelRunsSince`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/sync/repo.test.ts
describe("insertLevelRuns server_seq assignment", () => {
  it("assigns increasing server_seq values across separate inserts", () => {
    const db = openDb(":memory:");
    insertLevelRuns(db, "hash-1", [{ levelRunId: "run-1", levelNumber: 1, stars: 3, totalTime: 5000, levelCompleted: true }], 1_700_000_000_000);
    insertLevelRuns(db, "hash-1", [{ levelRunId: "run-2", levelNumber: 2, stars: 2, totalTime: 6000, levelCompleted: true }], 1_700_000_001_000);

    const runs = getLevelRunsForUser(db, "hash-1");
    const run1 = runs.find((r) => r.id === "run-1")!;
    const run2 = runs.find((r) => r.id === "run-2")!;
    expect(run2.server_seq).toBeGreaterThan(run1.server_seq);
    expect(run1.server_seq).toBeGreaterThan(0);
  });

  it("does not consume a server_seq value for a duplicate (INSERT OR IGNORE'd) run id", () => {
    const db = openDb(":memory:");
    const run = { levelRunId: "run-1", levelNumber: 1, stars: 3, totalTime: 5000, levelCompleted: true };

    insertLevelRuns(db, "hash-1", [run], 1_700_000_000_000);
    insertLevelRuns(db, "hash-1", [run], 1_700_000_000_000); // retry of the same batch
    insertLevelRuns(db, "hash-1", [{ ...run, levelRunId: "run-2" }], 1_700_000_001_000);

    const runs = getLevelRunsForUser(db, "hash-1");
    expect(runs).toHaveLength(2);
    const run2 = runs.find((r) => r.id === "run-2")!;
    expect(run2.server_seq).toBe(2); // not 3 — the retried duplicate never got a seq
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: FAIL — `server_seq` isn't set (stays at its `DEFAULT 0`).

- [ ] **Step 3: Implement the atomic increment**

Replace `insertLevelRuns` in `apps/backend/src/sync/repo.ts` (and add `server_seq` to `LevelRunRow`):

```ts
export type LevelRunRow = {
  id: string;
  email_hash: string;
  level_number: number;
  stars: number;
  total_time: number;
  level_completed: number;
  played_at: number;
  server_seq: number;
};

/**
 * Records every attempt at a Level, not just the best — level_stats stays
 * the best-ever cache the Levels page reads. `INSERT OR IGNORE` because id
 * (the client-generated levelRunId) is a natural dedup key: a retried sync
 * of the same batch should not double-record the same run.
 *
 * server_seq is a table-wide monotonic counter (ADR-0001's pull cursor),
 * assigned via a subquery inside the same synchronous INSERT statement —
 * node:sqlite executes each `run()` call synchronously with no interleaving
 * JS in between, so this is race-free without a separate counter table.
 * A duplicate (INSERT OR IGNORE'd) row never consumes a value, since the
 * subquery only runs when a row is actually inserted.
 */
export function insertLevelRuns(
  db: DatabaseSync,
  emailHash: string,
  runs: readonly LevelRunSummary[],
  playedAt: number,
): void {
  const insertRun = db.prepare(
    `INSERT OR IGNORE INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at, server_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT IFNULL(MAX(server_seq), 0) + 1 FROM level_runs))`,
  );
  runs.forEach((run) => {
    insertRun.run(
      run.levelRunId,
      emailHash,
      run.levelNumber,
      run.stars,
      run.totalTime,
      run.levelCompleted ? 1 : 0,
      playedAt,
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/sync/repo.ts apps/backend/src/sync/repo.test.ts
git commit -m "feat(backend): assign server_seq to inserted level_runs rows"
```

---

### Task 5: Pull-side repo queries

**Files:**
- Modify: `apps/backend/src/sync/repo.ts` (add `getTrialResultsSince`, `getLevelRunsSince`)
- Test: `apps/backend/src/sync/repo.test.ts`

**Interfaces:**
- Consumes: `TrialResultRow`, `LevelRunRow` (with `server_seq`), `getKeystrokesForTrialResult` — all existing/Task-4 types.
- Produces: `getTrialResultsSince(db, emailHash, sinceId): TrialResultRow[]`, `getLevelRunsSince(db, emailHash, sinceServerSeq): LevelRunRow[]` — consumed by Task 6's route.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/sync/repo.test.ts
describe("getTrialResultsSince / getLevelRunsSince", () => {
  it("returns only trial_results with id greater than the cursor, ordered by id", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [
      evaluateTrialResult({ ...baseTrialInput, trialId: "t1" } as TrialResultInput),
      evaluateTrialResult({ ...baseTrialInput, trialId: "t2" } as TrialResultInput),
    ]);
    const [first] = getTrialResultsForUser(db, "hash-1");

    const since = getTrialResultsSince(db, "hash-1", first.id);
    expect(since).toHaveLength(1);
    expect(since[0].id).toBeGreaterThan(first.id);
  });

  it("scopes getTrialResultsSince to the requesting user", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult({ ...baseTrialInput, trialId: "t1" } as TrialResultInput)]);
    insertTrialResults(db, "hash-2", [evaluateTrialResult({ ...baseTrialInput, trialId: "t2" } as TrialResultInput)]);

    expect(getTrialResultsSince(db, "hash-1", 0)).toHaveLength(1);
  });

  it("returns only level_runs with server_seq greater than the cursor, ordered by server_seq", () => {
    const db = openDb(":memory:");
    insertLevelRuns(db, "hash-1", [{ levelRunId: "run-1", levelNumber: 1, stars: 3, totalTime: 5000, levelCompleted: true }], 1_700_000_000_000);
    insertLevelRuns(db, "hash-1", [{ levelRunId: "run-2", levelNumber: 2, stars: 2, totalTime: 6000, levelCompleted: true }], 1_700_000_001_000);

    const since = getLevelRunsSince(db, "hash-1", 1);
    expect(since.map((r) => r.id)).toEqual(["run-2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: FAIL — `getTrialResultsSince`/`getLevelRunsSince` not exported yet.

- [ ] **Step 3: Implement the queries**

Add to `apps/backend/src/sync/repo.ts` (near `getTrialResultsForUser`/`getLevelRunsForUser`):

```ts
export function getTrialResultsSince(
  db: DatabaseSync,
  emailHash: string,
  sinceId: number,
): TrialResultRow[] {
  return db
    .prepare("SELECT * FROM trial_results WHERE email_hash = ? AND id > ? ORDER BY id")
    .all(emailHash, sinceId) as TrialResultRow[];
}

export function getLevelRunsSince(
  db: DatabaseSync,
  emailHash: string,
  sinceServerSeq: number,
): LevelRunRow[] {
  return db
    .prepare("SELECT * FROM level_runs WHERE email_hash = ? AND server_seq > ? ORDER BY server_seq")
    .all(emailHash, sinceServerSeq) as LevelRunRow[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/sync/repo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/sync/repo.ts apps/backend/src/sync/repo.test.ts
git commit -m "feat(backend): add cursor-based pull queries for trial_results/level_runs"
```

---

### Task 6: `GET /sync/pull` route

**Files:**
- Modify: `apps/backend/src/routes/sync.ts`
- Test: `apps/backend/src/routes/sync.test.ts`

**Interfaces:**
- Consumes: `getTrialResultsSince`, `getLevelRunsSince`, `getKeystrokesForTrialResult` (Task 5 + existing), `bearerToken`/`resolveEmailHash` (existing).
- Produces: `GET /sync/pull?sinceTrialId=<int>&sinceRunSeq=<int>` → `{ trialResults: [...], levelRuns: [...], cursor: { trialId: number, runSeq: number } }`. This is the endpoint the frontend's pull side (a later plan) calls.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/routes/sync.test.ts
describe("GET /sync/pull", () => {
  it("rejects an unauthenticated request", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/sync/pull" });
    expect(res.statusCode).toBe(401);
  });

  it("returns everything on a first pull (cursor omitted, defaults to 0)", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await postResults(app, token, batchFor(1, 17, 0));

    const res = await app.inject({
      method: "GET",
      url: "/sync/pull",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trialResults).toHaveLength(17);
    expect(body.levelRuns).toHaveLength(1);
    expect(body.cursor.trialId).toBeGreaterThan(0);
    expect(body.cursor.runSeq).toBeGreaterThan(0);
  });

  it("returns only rows newer than the given cursor", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await postResults(app, token, batchFor(1, 17, 0));

    const firstPull = await app.inject({
      method: "GET",
      url: "/sync/pull",
      headers: { authorization: `Bearer ${token}` },
    });
    const { cursor } = firstPull.json();

    await postResults(app, token, batchFor(2, 17, 0));

    const secondPull = await app.inject({
      method: "GET",
      url: `/sync/pull?sinceTrialId=${cursor.trialId}&sinceRunSeq=${cursor.runSeq}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = secondPull.json();
    expect(body.trialResults).toHaveLength(17);
    expect(body.levelRuns).toHaveLength(1);
    expect(body.levelRuns[0]).toMatchObject({ levelNumber: 2 });
  });

  it("nests each trial result's keystrokes", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    const res = await app.inject({
      method: "GET",
      url: "/sync/pull",
      headers: { authorization: `Bearer ${token}` },
    });
    const [result] = res.json().trialResults;
    expect(result.keystrokes).toEqual(trial.keystrokes);
  });

  it("rejects a non-integer cursor", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "GET",
      url: "/sync/pull?sinceTrialId=not-a-number",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/routes/sync.test.ts`
Expected: FAIL — 404, route doesn't exist.

- [ ] **Step 3: Implement the route**

In `apps/backend/src/routes/sync.ts`, update imports and add the route:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import { parseTrialResults, evaluateTrialResult, deriveLevelRuns } from "../sync/logic.js";
import {
  insertTrialResults,
  insertLevelRuns,
  upsertLevelStatsIfBetter,
  getAllLevelStatsForUser,
  getTrialResultsSince,
  getLevelRunsSince,
  getKeystrokesForTrialResult,
} from "../sync/repo.js";

function parseCursorParam(raw: unknown): number | null {
  if (raw === undefined) return 0;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post("/sync/results", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = parseTrialResults(request.body);
    if (trials === null) return reply.code(400).send({ error: "invalid_request" });

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    const levelTrials = evaluated.filter((t) => t.runType === "level");
    if (levelTrials.length > 0) {
      const runs = deriveLevelRuns(levelTrials);
      insertLevelRuns(db, emailHash, runs, Date.now());

      const syncedAt = Date.now();
      runs.forEach((run) => {
        upsertLevelStatsIfBetter(db, emailHash, run.levelNumber, run, syncedAt);
      });
    }

    return reply.send({ ok: true, stored: trials.length });
  });

  app.get("/sync/level-stats", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const rows = getAllLevelStatsForUser(db, emailHash);
    const levelStats = Object.fromEntries(
      rows.map((r) => [
        String(r.level_number),
        { stars: r.stars, totalTime: r.total_time, completedAt: new Date(r.completed_at).toISOString() },
      ]),
    );

    return reply.send({ levelStats });
  });

  // Cursor-based pull for offline-first devices (ADR-0001): returns every
  // trial_results/level_runs row newer than the given cursor, trial
  // keystrokes nested under their parent row. sinceTrialId/sinceRunSeq
  // default to 0 (everything) when omitted.
  app.get("/sync/pull", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const query = request.query as Record<string, unknown>;
    const sinceTrialId = parseCursorParam(query.sinceTrialId);
    const sinceRunSeq = parseCursorParam(query.sinceRunSeq);
    if (sinceTrialId === null || sinceRunSeq === null) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const trialRows = getTrialResultsSince(db, emailHash, sinceTrialId);
    const runRows = getLevelRunsSince(db, emailHash, sinceRunSeq);

    const trialResults = trialRows.map((r) => ({
      id: r.id,
      levelNumber: r.level_number,
      categoryCodename: r.category_codename,
      correct: r.correct === 1,
      timeExceeded: r.time_exceeded === 1,
      clientCorrect: r.client_correct === 1,
      clientTimeExceeded: r.client_time_exceeded === 1,
      timeTaken: r.time_taken,
      playedAt: r.played_at,
      hintShown: r.hint_shown === 1,
      streakAtSubmit: r.streak_at_submit,
      hintsAvailableAtStart: r.hints_available_at_start,
      runId: r.run_id,
      runType: r.run_type,
      keystrokes: getKeystrokesForTrialResult(db, r.id).map((k) => ({ key: k.key, t: k.t })),
    }));

    const levelRuns = runRows.map((r) => ({
      id: r.id,
      levelNumber: r.level_number,
      stars: r.stars,
      totalTime: r.total_time,
      levelCompleted: r.level_completed === 1,
      playedAt: r.played_at,
      serverSeq: r.server_seq,
    }));

    const cursor = {
      trialId: trialRows.length > 0 ? trialRows[trialRows.length - 1].id : sinceTrialId,
      runSeq: runRows.length > 0 ? runRows[runRows.length - 1].server_seq : sinceRunSeq,
    };

    return reply.send({ trialResults, levelRuns, cursor });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/routes/sync.test.ts`
Expected: PASS

Then run the full backend suite:

Run: `pnpm --filter backend test:run`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter backend typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/sync.ts apps/backend/src/routes/sync.test.ts
git commit -m "feat(backend): add GET /sync/pull cursor-based pull endpoint"
```

---

## Self-Review Notes

- **Spec coverage**: ADR-0001's push/pull cursor design (Task 5/6), the `run_trial_id` dedup key (Task 1/3), and the `server_seq` column (Task 2/4) are all implemented. FK constraints are explicitly out of scope (see Global Constraints) — a separate follow-up plan. Anonymous→logged-in re-keying interaction with the pull cursor is unresolved in the ADR itself and stays unresolved here — `mergeAnonymousIdentity` (`apps/backend/src/sync/repo.ts:198-211`) re-keys `trial_results`/`level_runs` rows' `email_hash` in place without touching `id`/`server_seq`, so a pull cursor learned under the anonymous identity is still valid after an upgrade; a dedicated plan should still verify this once the frontend's local store exists to test against.
- **Type consistency**: `TrialResultRow`/`LevelRunRow` (repo.ts) → `getTrialResultsSince`/`getLevelRunsSince` (Task 5) → route mapping (Task 6) use the same field names throughout (`r.level_number`, `r.run_trial_id` is intentionally never read back — write-only dedup key, not part of any read path).
- **No placeholders**: every step has real, runnable code.
