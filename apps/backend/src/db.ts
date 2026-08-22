import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Schema grows here as tables are needed — applied in order, each
// statement idempotent via IF NOT EXISTS.
const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     email_hash TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL
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
     played_at INTEGER NOT NULL
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
];

// `CREATE TABLE IF NOT EXISTS` is a no-op against a table that already
// exists with an older column set, so a new NOT NULL column needs an
// explicit, idempotent migration on top — added here as each becomes
// necessary. Existing rows predate the client/server correctness split
// (ticket 05/ADR-0005), so their claim is backfilled from what was, at
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

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  SCHEMA_STATEMENTS.forEach((statement) => db.exec(statement));
  migrateClientCorrectnessColumns(db);
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
