import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "./db.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function columnNames(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((c) => c.name);
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  ).map((t) => t.name);
}

function indexedColumns(db: DatabaseSync, index: string): string[] {
  return (
    db.prepare(`PRAGMA index_info(${index})`).all() as { name: string }[]
  ).map((column) => column.name);
}

describe("openDb", () => {
  it("creates users with is_anonymous on a fresh database", () => {
    const db = openDb(":memory:");
    expect(columnNames(db, "users")).toEqual(
      expect.arrayContaining(["email_hash", "created_at", "is_anonymous"]),
    );
  });

  it("creates trial_results with operands and answer on a fresh database", () => {
    const db = openDb(":memory:");
    expect(columnNames(db, "trial_results")).toEqual(
      expect.arrayContaining(["operands", "answer"]),
    );
  });

  it("creates trial_results with run_id, run_type, and hint_shown on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = columnNames(db, "trial_results");
    expect(columns).toEqual(
      expect.arrayContaining(["run_id", "run_type", "hint_shown"]),
    );
  });

  it("creates trial_results.id as a client-generated TEXT primary key, not an autoincrement integer", () => {
    const db = openDb(":memory:");
    const [idColumn] = db.prepare("PRAGMA table_info(trial_results)").all() as {
      name: string;
      type: string;
      pk: number;
    }[];
    expect(idColumn).toMatchObject({ name: "id", type: "TEXT", pk: 1 });
  });

  it("does not carry the removed client-claim/hint-history columns", () => {
    const db = openDb(":memory:");
    const columns = columnNames(db, "trial_results");
    expect(columns).not.toEqual(
      expect.arrayContaining([
        "client_correct",
        "client_time_exceeded",
        "streak_at_submit",
        "hints_available_at_start",
      ]),
    );
  });

  it("does not create the level_stats, level_runs, or trial_keystrokes tables", () => {
    const db = openDb(":memory:");
    expect(tableNames(db)).not.toEqual(
      expect.arrayContaining(["level_stats", "level_runs", "trial_keystrokes"]),
    );
  });

  it("creates the named trial_results email_hash index on a fresh database", () => {
    const db = openDb(":memory:");

    expect(indexedColumns(db, "idx_trial_results_email_hash")).toEqual([
      "email_hash",
    ]);
  });

  it("adds the trial_results email_hash index to an existing database and reapplies it idempotently", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "existing.sqlite");
    const existingDb = new DatabaseSync(dbPath);
    existingDb.exec(
      "CREATE TABLE trial_results (id TEXT PRIMARY KEY, email_hash TEXT NOT NULL)",
    );
    existingDb.close();

    openDb(dbPath).close();
    const db = openDb(dbPath);

    expect(indexedColumns(db, "idx_trial_results_email_hash")).toEqual([
      "email_hash",
    ]);
    const matchingIndexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .all("idx_trial_results_email_hash");
    expect(matchingIndexes).toHaveLength(1);
  });

  it("is idempotent — opening the same database twice does not error or duplicate columns", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "twice.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);

    const columns = columnNames(db, "trial_results");
    expect(columns.filter((c) => c === "run_type")).toHaveLength(1);
    expect(columns.filter((c) => c === "operands")).toHaveLength(1);
  });

  it("cleans expired auth data on startup using the injected time", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "cleanup.sqlite");
    const db = openDb(dbPath);
    db.exec(`
      INSERT INTO users (email_hash, created_at, is_anonymous)
      VALUES ('expired-anonymous', 1, 1);
      INSERT INTO sessions (token, email_hash, expires_at)
      VALUES ('expired-session', 'expired-anonymous', 99);
      INSERT INTO otp_codes (email_hash, code, expires_at, requested_at)
      VALUES ('expired-otp', '123456', 99, 1);
    `);
    db.close();

    const reopenedDb = openDb(dbPath, 100);

    expect(reopenedDb.prepare("SELECT * FROM sessions").all()).toHaveLength(0);
    expect(reopenedDb.prepare("SELECT * FROM otp_codes").all()).toHaveLength(0);
    expect(reopenedDb.prepare("SELECT * FROM users").all()).toHaveLength(0);
  });

  it("seeds the levels table from LEVEL_SEED_DATA on a fresh database", () => {
    const db = openDb(":memory:");
    const { count } = db
      .prepare("SELECT COUNT(*) as count FROM levels")
      .get() as {
      count: number;
    };
    expect(count).toBe(150);
  });

  it("does not re-seed a database that already has levels", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "levels.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);
    const { count } = db
      .prepare("SELECT COUNT(*) as count FROM levels")
      .get() as {
      count: number;
    };
    expect(count).toBe(150); // not 300 — seeding ran once, not on every open
  });
});
