import { describe, it, expect, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe("openDb", () => {
  it("creates users with is_anonymous on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toEqual(expect.arrayContaining(["email_hash", "created_at", "is_anonymous"]));
  });

  it("migrates a pre-anonymous-accounts database, defaulting is_anonymous to 0", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash1', 1700000000000)`);
    legacyDb.close();

    const migrated = openDb(dbPath);
    const row = migrated.prepare("SELECT * FROM users").get() as Record<string, number>;
    expect(row.is_anonymous).toBe(0);
  });

  it("creates trial_results with client_correct/client_time_exceeded on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining(["correct", "time_exceeded", "client_correct", "client_time_exceeded"]),
    );
  });

  it("creates trial_results with hint_shown/streak_at_submit/hints_available_at_start on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining(["hint_shown", "streak_at_submit", "hints_available_at_start"]),
    );
  });

  it("migrates a pre-hint-tracking database, defaulting the new columns to 0", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    // Simulate a deployed database from before hint/streak tracking existed.
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
       VALUES ('hash1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000)`,
    );
    legacyDb.close();

    const migrated = openDb(dbPath);
    const row = migrated.prepare("SELECT * FROM trial_results").get() as Record<string, number>;
    expect(row.hint_shown).toBe(0);
    expect(row.streak_at_submit).toBe(0);
    expect(row.hints_available_at_start).toBe(0);
  });

  it("creates trial_results with run_id and run_type on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toEqual(expect.arrayContaining(["run_id", "run_type"]));
    expect(columns).not.toContain("level_run_id");
  });

  it("migrates a pre-run-type database, renaming level_run_id to run_id and defaulting run_type to 'level'", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    // Simulate a deployed database from before Practice sync existed.
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
      played_at INTEGER NOT NULL,
      hint_shown INTEGER NOT NULL DEFAULT 0,
      streak_at_submit INTEGER NOT NULL DEFAULT 0,
      hints_available_at_start INTEGER NOT NULL DEFAULT 0,
      level_run_id TEXT NOT NULL DEFAULT ''
    )`);
    legacyDb.exec(`CREATE INDEX trial_results_level_run_id_idx ON trial_results (level_run_id)`);
    legacyDb.exec(
      `INSERT INTO trial_results (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, level_run_id)
       VALUES ('hash1', 1, '1d+1d', 1, 0, 1, 0, 1000, 1700000000000, 'old-run')`,
    );
    legacyDb.close();

    const migrated = openDb(dbPath);
    const row = migrated.prepare("SELECT * FROM trial_results").get() as Record<string, unknown>;
    expect(row.run_id).toBe("old-run");
    expect(row.run_type).toBe("level");
    expect(row.level_run_id).toBeUndefined();
  });

  it("is idempotent — running the run_id/run_type migration twice does not error, and leaves exactly one run_id index", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "twice.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);

    const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns.filter((c) => c === "run_type")).toHaveLength(1);

    const indexNames = (db.prepare("PRAGMA index_list(trial_results)").all() as { name: string }[]).map(
      (i) => i.name,
    );
    expect(indexNames.filter((n) => n === "trial_results_run_id_idx")).toHaveLength(1);
    expect(indexNames).not.toContain("trial_results_level_run_id_idx");
  });

  it("migrates a pre-ticket-05 database, backfilling client claims from the existing correct/time_exceeded", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    // Simulate a deployed database from before ticket 05 (no client_* columns).
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`CREATE TABLE trial_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_hash TEXT NOT NULL,
      level_number INTEGER NOT NULL,
      category_codename TEXT NOT NULL,
      correct INTEGER NOT NULL,
      time_exceeded INTEGER NOT NULL,
      time_taken INTEGER NOT NULL,
      played_at INTEGER NOT NULL
    )`);
    legacyDb.exec(
      `INSERT INTO trial_results (email_hash, level_number, category_codename, correct, time_exceeded, time_taken, played_at)
       VALUES ('hash1', 1, '1d+1d', 1, 0, 1000, 1700000000000)`,
    );
    legacyDb.close();

    const migrated = openDb(dbPath);
    const row = migrated.prepare("SELECT * FROM trial_results").get() as Record<string, number>;
    expect(row.client_correct).toBe(1);
    expect(row.client_time_exceeded).toBe(0);
  });

  it("is idempotent — running the migration twice does not error or change already-migrated data", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "twice.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);
    const columns = (db.prepare("PRAGMA table_info(trial_results)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns.filter((c) => c === "client_correct")).toHaveLength(1);
  });

  it("seeds the levels table from LEVEL_SEED_DATA on a fresh database", () => {
    const db = openDb(":memory:");
    const { count } = db.prepare("SELECT COUNT(*) as count FROM levels").get() as {
      count: number;
    };
    expect(count).toBe(150);
  });

  it("does not re-seed a database that already has levels", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "levels.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);
    const { count } = db.prepare("SELECT COUNT(*) as count FROM levels").get() as {
      count: number;
    };
    expect(count).toBe(150); // not 300 — seeding ran once, not on every open
  });

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
});
