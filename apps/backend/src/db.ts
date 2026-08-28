import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedLevelsIfEmpty } from "./levels/repo.js";

// Schema grows here as tables are needed — applied in order, each
// statement idempotent via IF NOT EXISTS.
const SCHEMA_STATEMENTS: readonly string[] = [
  // is_anonymous distinguishes a device-id identity (minted via
  // POST /auth/device, no email ever collected) from a real email-verified
  // one — both share this one email_hash column (see hashDeviceId), so
  // without this flag the server can't tell them apart from the hash alone
  // when deciding whether a session is safe to merge-and-discard on login.
  `CREATE TABLE IF NOT EXISTS users (
     email_hash TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL,
     is_anonymous INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
     email_hash TEXT PRIMARY KEY,
     code TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     requested_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL REFERENCES users(email_hash),
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS trial_results (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email_hash TEXT NOT NULL REFERENCES users(email_hash),
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
  `CREATE INDEX IF NOT EXISTS trial_results_email_hash_idx ON trial_results (email_hash)`,
  `CREATE INDEX IF NOT EXISTS trial_results_level_number_idx ON trial_results (level_number)`,
  `CREATE TABLE IF NOT EXISTS trial_keystrokes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     trial_result_id INTEGER NOT NULL REFERENCES trial_results(id),
     key TEXT NOT NULL,
     t INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS trial_keystrokes_trial_result_id_idx ON trial_keystrokes (trial_result_id)`,
  `CREATE TABLE IF NOT EXISTS level_stats (
     email_hash TEXT NOT NULL REFERENCES users(email_hash),
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     completed_at INTEGER NOT NULL,
     PRIMARY KEY (email_hash, level_number)
   )`,
  // Every attempt at a Level, not just the best one — level_stats above
  // stays the best-ever cache the Levels page reads, this is the full
  // history. id is the client-generated levelRunId (see game/index.ts),
  // which is also what trial_results.run_id groups back to this row.
  `CREATE TABLE IF NOT EXISTS level_runs (
     id TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL REFERENCES users(email_hash),
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     level_completed INTEGER NOT NULL,
     played_at INTEGER NOT NULL,
     server_seq INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS level_runs_email_hash_idx ON level_runs (email_hash)`,
  `CREATE INDEX IF NOT EXISTS level_runs_level_number_idx ON level_runs (level_number)`,
  // The Level catalog — content, read wholesale, rarely written.
  // mix is a JSON-encoded Record<categoryCodename, weight>, not a normalized
  // shape: nothing here needs relational queries, only whole-row reads.
  `CREATE TABLE IF NOT EXISTS levels (
     level_number INTEGER PRIMARY KEY,
     mix TEXT NOT NULL
   )`,
];

// `CREATE TABLE IF NOT EXISTS` is a no-op against a table that already
// exists with an older column set, so a new NOT NULL column needs an
// explicit, idempotent migration on top — added here as each becomes
// necessary. `backfill`, when present, derives the new column's value from
// whatever equivalent was recorded before; omitted entries have no
// equivalent to backfill from, so the DEFAULT in `ddl` is the real answer.
type ColumnMigration = {
  table: string;
  column: string;
  ddl: string;
  backfill?: string;
};

const COLUMN_MIGRATIONS: readonly ColumnMigration[] = [
  // Existing rows predate the client/server correctness split (ticket 05).
  {
    table: "trial_results",
    column: "client_correct",
    ddl: "ALTER TABLE trial_results ADD COLUMN client_correct INTEGER NOT NULL DEFAULT 0",
    backfill: "UPDATE trial_results SET client_correct = correct",
  },
  {
    table: "trial_results",
    column: "client_time_exceeded",
    ddl: "ALTER TABLE trial_results ADD COLUMN client_time_exceeded INTEGER NOT NULL DEFAULT 0",
    backfill: "UPDATE trial_results SET client_time_exceeded = time_exceeded",
  },
  // Existing rows predate hint/streak tracking (ticket 03 follow-up) — 0
  // (unknown) is the same value as a trial where no hint was ever available.
  {
    table: "trial_results",
    column: "hint_shown",
    ddl: "ALTER TABLE trial_results ADD COLUMN hint_shown INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "trial_results",
    column: "streak_at_submit",
    ddl: "ALTER TABLE trial_results ADD COLUMN streak_at_submit INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "trial_results",
    column: "hints_available_at_start",
    ddl: "ALTER TABLE trial_results ADD COLUMN hints_available_at_start INTEGER NOT NULL DEFAULT 0",
  },
  // Existing rows predate Practice sync — every one of them is a Level
  // trial by definition, so 'level' is exactly correct, not just a
  // placeholder default.
  {
    table: "trial_results",
    column: "run_type",
    ddl: "ALTER TABLE trial_results ADD COLUMN run_type TEXT NOT NULL DEFAULT 'level'",
  },
  // Existing users all predate anonymous accounts and are, by definition,
  // real email-verified ones — 0 (not anonymous) is exactly correct, no
  // ambiguity like the columns above had.
  {
    table: "users",
    column: "is_anonymous",
    ddl: "ALTER TABLE users ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0",
  },
  // Offline-sync dedup key (ADR-0001) — '' means "no dedup key", exactly
  // as ungroupable for retry-dedup purposes as every pre-sync row already was.
  {
    table: "trial_results",
    column: "run_trial_id",
    ddl: "ALTER TABLE trial_results ADD COLUMN run_trial_id TEXT NOT NULL DEFAULT ''",
  },
  // Offline-sync pull cursor (ADR-0001). 0 means "predates cursor sync" —
  // a fresh pull (cursor 0) correctly picks up every such row once, then
  // never again, since new rows always get a real positive value.
  {
    table: "level_runs",
    column: "server_seq",
    ddl: "ALTER TABLE level_runs ADD COLUMN server_seq INTEGER NOT NULL DEFAULT 0",
  },
];

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  );
}

// Ensures run_id exists, covering both migration paths: a database that
// already has level_run_id (added by an older ticket) gets it renamed —
// dropping the old index name too, so a migrated database doesn't carry two
// indexes over the same (renamed) column — while a database old enough to
// predate level_run_id entirely just gets run_id added fresh, '' meaning
// exactly as ungroupable as it always was. Doesn't fit ColumnMigration's
// single-DDL ADD-COLUMN shape, so it's its own step, run after
// COLUMN_MIGRATIONS.
function ensureRunIdColumn(db: DatabaseSync): void {
  const columns = tableColumns(db, "trial_results");
  if (columns.has("run_id")) return;
  if (columns.has("level_run_id")) {
    db.exec("ALTER TABLE trial_results RENAME COLUMN level_run_id TO run_id");
    db.exec("DROP INDEX IF EXISTS trial_results_level_run_id_idx");
  } else {
    db.exec("ALTER TABLE trial_results ADD COLUMN run_id TEXT NOT NULL DEFAULT ''");
  }
}

function applyColumnMigrations(db: DatabaseSync): void {
  COLUMN_MIGRATIONS.forEach(({ table, column, ddl, backfill }) => {
    if (tableColumns(db, table).has(column)) return;
    db.exec(ddl);
    if (backfill) db.exec(backfill);
  });
  ensureRunIdColumn(db);
  // Unconditional: needs to run for a fresh database too, where run_id
  // already exists from CREATE TABLE and the rename above never fires.
  db.exec(
    "CREATE INDEX IF NOT EXISTS trial_results_run_id_idx ON trial_results (run_id)",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS trial_results_run_trial_id_idx ON trial_results (run_trial_id) WHERE run_trial_id != ''",
  );
}

function hasForeignKeys(db: DatabaseSync, table: string): boolean {
  return (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as unknown[]).length > 0;
}

// Rebuilds sessions/trial_results/trial_keystrokes/level_stats/level_runs
// with real FOREIGN KEY constraints — SQLite can't ALTER TABLE ADD
// CONSTRAINT, so an existing (pre-FK) database needs a create-new/copy-data/
// drop-old/rename-new rebuild per table. Each table is guarded
// independently (not just once for all five) — a database that predates
// one of these tables entirely gets it freshly created with the FK already
// inline via SCHEMA_STATEMENTS, which must not cause the *other*,
// still-old tables to be skipped. Done in one transaction with FK
// enforcement off (SQLite defers toggling `foreign_keys` until a
// transaction ends, so it has to be set before BEGIN, not inside it) and
// verified via `foreign_key_check` before committing. A no-op for a fully
// fresh database, where every table already gets its constraint from
// SCHEMA_STATEMENTS' CREATE TABLE.
//
// otp_codes deliberately has no FK to users: POST /auth/otp/request writes
// an otp_codes row for a brand-new email before any users row exists for it
// (the users row is only created in POST /auth/otp/verify) — a FK here
// would break every first-time login.
function rebuildTablesWithForeignKeys(db: DatabaseSync): void {
  const needsRebuild =
    !hasForeignKeys(db, "sessions") ||
    !hasForeignKeys(db, "trial_results") ||
    !hasForeignKeys(db, "trial_keystrokes") ||
    !hasForeignKeys(db, "level_stats") ||
    !hasForeignKeys(db, "level_runs");
  if (!needsRebuild) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN TRANSACTION");
  try {
    if (!hasForeignKeys(db, "sessions")) {
      db.exec(`CREATE TABLE sessions_new (
         token TEXT PRIMARY KEY,
         email_hash TEXT NOT NULL REFERENCES users(email_hash),
         expires_at INTEGER NOT NULL
       )`);
      db.exec(
        "INSERT INTO sessions_new (token, email_hash, expires_at) SELECT token, email_hash, expires_at FROM sessions",
      );
      db.exec("DROP TABLE sessions");
      db.exec("ALTER TABLE sessions_new RENAME TO sessions");
    }

    if (!hasForeignKeys(db, "trial_results")) {
      db.exec(`CREATE TABLE trial_results_new (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         email_hash TEXT NOT NULL REFERENCES users(email_hash),
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
       )`);
      // Explicit column list on both sides — required, not stylistic: older
      // columns (client_correct, run_type, run_trial_id, etc.) were added
      // via ALTER TABLE ADD COLUMN, which always appends physically at the
      // end regardless of where it's declared in CREATE TABLE, so a
      // `SELECT *` here would silently copy values into the wrong columns
      // on any database that predates one of them.
      db.exec(`INSERT INTO trial_results_new
         (id, email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, run_id, run_type, run_trial_id)
       SELECT id, email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, run_id, run_type, run_trial_id
       FROM trial_results`);
      db.exec("DROP TABLE trial_results");
      db.exec("ALTER TABLE trial_results_new RENAME TO trial_results");
      db.exec("CREATE INDEX IF NOT EXISTS trial_results_email_hash_idx ON trial_results (email_hash)");
      db.exec("CREATE INDEX IF NOT EXISTS trial_results_level_number_idx ON trial_results (level_number)");
      db.exec("CREATE INDEX IF NOT EXISTS trial_results_run_id_idx ON trial_results (run_id)");
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS trial_results_run_trial_id_idx ON trial_results (run_trial_id) WHERE run_trial_id != ''",
      );
    }

    if (!hasForeignKeys(db, "trial_keystrokes")) {
      db.exec(`CREATE TABLE trial_keystrokes_new (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         trial_result_id INTEGER NOT NULL REFERENCES trial_results(id),
         key TEXT NOT NULL,
         t INTEGER NOT NULL
       )`);
      db.exec(
        "INSERT INTO trial_keystrokes_new (id, trial_result_id, key, t) SELECT id, trial_result_id, key, t FROM trial_keystrokes",
      );
      db.exec("DROP TABLE trial_keystrokes");
      db.exec("ALTER TABLE trial_keystrokes_new RENAME TO trial_keystrokes");
      db.exec(
        "CREATE INDEX IF NOT EXISTS trial_keystrokes_trial_result_id_idx ON trial_keystrokes (trial_result_id)",
      );
    }

    if (!hasForeignKeys(db, "level_stats")) {
      db.exec(`CREATE TABLE level_stats_new (
         email_hash TEXT NOT NULL REFERENCES users(email_hash),
         level_number INTEGER NOT NULL,
         stars INTEGER NOT NULL,
         total_time INTEGER NOT NULL,
         completed_at INTEGER NOT NULL,
         PRIMARY KEY (email_hash, level_number)
       )`);
      db.exec(`INSERT INTO level_stats_new (email_hash, level_number, stars, total_time, completed_at)
       SELECT email_hash, level_number, stars, total_time, completed_at FROM level_stats`);
      db.exec("DROP TABLE level_stats");
      db.exec("ALTER TABLE level_stats_new RENAME TO level_stats");
    }

    if (!hasForeignKeys(db, "level_runs")) {
      db.exec(`CREATE TABLE level_runs_new (
         id TEXT PRIMARY KEY,
         email_hash TEXT NOT NULL REFERENCES users(email_hash),
         level_number INTEGER NOT NULL,
         stars INTEGER NOT NULL,
         total_time INTEGER NOT NULL,
         level_completed INTEGER NOT NULL,
         played_at INTEGER NOT NULL,
         server_seq INTEGER NOT NULL DEFAULT 0
       )`);
      db.exec(`INSERT INTO level_runs_new (id, email_hash, level_number, stars, total_time, level_completed, played_at, server_seq)
       SELECT id, email_hash, level_number, stars, total_time, level_completed, played_at, server_seq FROM level_runs`);
      db.exec("DROP TABLE level_runs");
      db.exec("ALTER TABLE level_runs_new RENAME TO level_runs");
      db.exec("CREATE INDEX IF NOT EXISTS level_runs_email_hash_idx ON level_runs (email_hash)");
      db.exec("CREATE INDEX IF NOT EXISTS level_runs_level_number_idx ON level_runs (level_number)");
    }

    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`foreign key violations found while migrating to FK-enforced tables: ${JSON.stringify(violations)}`);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  SCHEMA_STATEMENTS.forEach((statement) => db.exec(statement));
  applyColumnMigrations(db);
  rebuildTablesWithForeignKeys(db);
  db.exec("PRAGMA foreign_keys = ON");
  seedLevelsIfEmpty(db);
  return db;
}

export function isDbReachable(db: DatabaseSync): boolean {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}
