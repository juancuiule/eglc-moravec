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
     email_hash TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
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
     level_run_id TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS trial_results_email_hash_idx ON trial_results (email_hash)`,
  `CREATE INDEX IF NOT EXISTS trial_results_level_number_idx ON trial_results (level_number)`,
  `CREATE TABLE IF NOT EXISTS trial_keystrokes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     trial_result_id INTEGER NOT NULL,
     key TEXT NOT NULL,
     t INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS trial_keystrokes_trial_result_id_idx ON trial_keystrokes (trial_result_id)`,
  `CREATE TABLE IF NOT EXISTS level_stats (
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     completed_at INTEGER NOT NULL,
     PRIMARY KEY (email_hash, level_number)
   )`,
  // Every attempt at a Level, not just the best one — level_stats above
  // stays the best-ever cache the Levels page reads, this is the full
  // history. id is the client-generated levelRunId (see game/index.ts),
  // which is also what trial_results.level_run_id groups back to this row.
  `CREATE TABLE IF NOT EXISTS level_runs (
     id TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     stars INTEGER NOT NULL,
     total_time INTEGER NOT NULL,
     level_completed INTEGER NOT NULL,
     played_at INTEGER NOT NULL
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
  // Existing rows predate level-run grouping — '' (ungroupable) is exactly
  // as unknown as the hint/streak columns' 0 default above.
  {
    table: "trial_results",
    column: "level_run_id",
    ddl: "ALTER TABLE trial_results ADD COLUMN level_run_id TEXT NOT NULL DEFAULT ''",
  },
  // Existing users all predate anonymous accounts and are, by definition,
  // real email-verified ones — 0 (not anonymous) is exactly correct, no
  // ambiguity like the columns above had.
  {
    table: "users",
    column: "is_anonymous",
    ddl: "ALTER TABLE users ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0",
  },
];

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  );
}

function applyColumnMigrations(db: DatabaseSync): void {
  COLUMN_MIGRATIONS.forEach(({ table, column, ddl, backfill }) => {
    if (tableColumns(db, table).has(column)) return;
    db.exec(ddl);
    if (backfill) db.exec(backfill);
  });
  // Unconditional: needs to run for a fresh database too, where
  // level_run_id already exists from CREATE TABLE and its migration above
  // never fires.
  db.exec(
    "CREATE INDEX IF NOT EXISTS trial_results_level_run_id_idx ON trial_results (level_run_id)",
  );
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  SCHEMA_STATEMENTS.forEach((statement) => db.exec(statement));
  applyColumnMigrations(db);
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
