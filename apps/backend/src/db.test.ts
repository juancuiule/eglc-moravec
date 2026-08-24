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
});
