import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedLevelsIfEmpty } from "./levels/repo.js";

const SCHEMA_STATEMENTS: readonly string[] = [
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
     id TEXT PRIMARY KEY,
     email_hash TEXT NOT NULL,
     level_number INTEGER NOT NULL,
     category_codename TEXT NOT NULL,
     operands TEXT NOT NULL,
     answer INTEGER,
     correct INTEGER NOT NULL,
     time_exceeded INTEGER NOT NULL,
     time_taken INTEGER NOT NULL,
     played_at INTEGER NOT NULL,
     hint_shown INTEGER NOT NULL DEFAULT 0,
     run_id TEXT NOT NULL DEFAULT '',
     run_type TEXT NOT NULL DEFAULT 'level'
   )`,
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

const COLUMN_MIGRATIONS: readonly ColumnMigration[] = [];

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
}

function applyColumnMigrations(db: DatabaseSync): void {
  COLUMN_MIGRATIONS.forEach(({ table, column, ddl, backfill }) => {
    if (tableColumns(db, table).has(column)) return;
    db.exec(ddl);
    if (backfill) db.exec(backfill);
  });
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
