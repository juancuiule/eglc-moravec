import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedLevelsIfEmpty } from "./levels/repo.js";

// Schema grows here as tables are needed — applied in order, each
// statement idempotent via IF NOT EXISTS. No migration path is maintained
// for anything predating this shape: trial_results.id in particular used to
// be a server-generated INTEGER AUTOINCREMENT, which has no meaningful
// mapping to the client-generated TEXT id used now, so a database from
// before this schema is expected to be reset, not migrated.
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
  // id is client-generated (a UUID) rather than server-assigned — this is
  // what makes a retried push idempotent via INSERT OR IGNORE on id alone,
  // with no server round-trip needed to learn what id got assigned.
  `CREATE TABLE IF NOT EXISTS trial_results (
     id TEXT PRIMARY KEY,
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
     run_type TEXT NOT NULL DEFAULT 'level'
   )`,
  `CREATE INDEX IF NOT EXISTS trial_results_email_hash_idx ON trial_results (email_hash)`,
  `CREATE INDEX IF NOT EXISTS trial_results_level_number_idx ON trial_results (level_number)`,
  `CREATE INDEX IF NOT EXISTS trial_results_run_id_idx ON trial_results (run_id)`,
  `CREATE TABLE IF NOT EXISTS trial_keystrokes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     trial_result_id TEXT NOT NULL,
     key TEXT NOT NULL,
     t INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS trial_keystrokes_trial_result_id_idx ON trial_keystrokes (trial_result_id)`,
  // Every attempt at a Level, not just the best one — LevelStats (the
  // best-ever record) is derived client-side from this table, not stored
  // server-side as its own entity. id is the client-generated levelRunId
  // (see game/index.ts), which is also what trial_results.run_id groups
  // back to this row.
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
  // One global, append-only log of every trial_results/level_runs row ever
  // actually inserted (never on a duplicate INSERT OR IGNORE no-op) — the
  // seq column is what a client's sync cursor advances against, so it can
  // ask "what's new since I last synced" without relying on played_at
  // (client clocks aren't trustworthy, and can collide).
  `CREATE TABLE IF NOT EXISTS sync_log (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     entity_type TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     email_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sync_log_email_hash_seq_idx ON sync_log (email_hash, seq)`,
  // The Level catalog — content, read wholesale, rarely written.
  // mix is a JSON-encoded Record<categoryCodename, weight>, not a normalized
  // shape: nothing here needs relational queries, only whole-row reads.
  `CREATE TABLE IF NOT EXISTS levels (
     level_number INTEGER PRIMARY KEY,
     mix TEXT NOT NULL
   )`,
];

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  SCHEMA_STATEMENTS.forEach((statement) => db.exec(statement));
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
