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
// necessary. Existing rows predate the client/server correctness split
// (ticket 05), so their claim is backfilled from what was, at
// the time, the only recorded value.
function migrateClientCorrectnessColumns(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!columns.has("client_correct")) {
    db.exec("ALTER TABLE trial_results ADD COLUMN client_correct INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE trial_results SET client_correct = correct");
  }
  if (!columns.has("client_time_exceeded")) {
    db.exec(
      "ALTER TABLE trial_results ADD COLUMN client_time_exceeded INTEGER NOT NULL DEFAULT 0",
    );
    db.exec("UPDATE trial_results SET client_time_exceeded = time_exceeded");
  }
}

// Existing rows predate hint/streak tracking (ticket 03 follow-up) and have
// no equivalent value to backfill from — default to 0 (unknown), same as a
// trial where no hint was ever available.
function migrateHintAndStreakColumns(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!columns.has("hint_shown")) {
    db.exec("ALTER TABLE trial_results ADD COLUMN hint_shown INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("streak_at_submit")) {
    db.exec("ALTER TABLE trial_results ADD COLUMN streak_at_submit INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("hints_available_at_start")) {
    db.exec(
      "ALTER TABLE trial_results ADD COLUMN hints_available_at_start INTEGER NOT NULL DEFAULT 0",
    );
  }
}

// Existing rows predate level-run grouping and have no run to backfill
// against — default to '' (ungroupable), same spirit as the hint/streak
// columns' 0 default.
function migrateLevelRunIdColumn(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!columns.has("level_run_id")) {
    db.exec("ALTER TABLE trial_results ADD COLUMN level_run_id TEXT NOT NULL DEFAULT ''");
  }
  // Outside the if: needs to run for a fresh database too, where the column
  // already exists from CREATE TABLE and this branch never executes.
  db.exec("CREATE INDEX IF NOT EXISTS trial_results_level_run_id_idx ON trial_results (level_run_id)");
}

// Existing users all predate anonymous accounts and are, by definition,
// real email-verified ones — default 0 (not anonymous) is exactly correct
// for backfill here, no ambiguity like the hint/streak/run-id columns had.
function migrateUserIsAnonymousColumn(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has("is_anonymous")) {
    db.exec("ALTER TABLE users ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0");
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  SCHEMA_STATEMENTS.forEach((statement) => db.exec(statement));
  migrateClientCorrectnessColumns(db);
  migrateHintAndStreakColumns(db);
  migrateLevelRunIdColumn(db);
  migrateUserIsAnonymousColumn(db);
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
