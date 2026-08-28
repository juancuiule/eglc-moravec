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
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash1', 1700000000000)`);
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
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash1', 1700000000000)`);
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
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash1', 1700000000000)`);
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
    db.prepare("INSERT INTO users (email_hash, created_at) VALUES ('hash-1', 1700000000000)").run();
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
    db.prepare("INSERT INTO users (email_hash, created_at) VALUES ('hash-1', 1700000000000)").run();
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
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash-1', 1700000000000)`);
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
    legacyDb.exec(`CREATE TABLE users (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0)`);
    legacyDb.exec(`INSERT INTO users (email_hash, created_at) VALUES ('hash-1', 1700000000000)`);
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

  it("enforces trial_keystrokes.trial_result_id as a real foreign key on a fresh database", () => {
    const db = openDb(":memory:");
    expect(() =>
      db
        .prepare(`INSERT INTO trial_keystrokes (trial_result_id, key, t) VALUES (999999, '5', 100)`)
        .run(),
    ).toThrow();
  });

  it("enforces level_runs.email_hash as a real foreign key on a fresh database", () => {
    const db = openDb(":memory:");
    expect(() =>
      db
        .prepare(
          `INSERT INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at)
           VALUES ('run-1', 'nonexistent-hash', 1, 3, 5000, 1, 1700000000000)`,
        )
        .run(),
    ).toThrow();
  });

  it("reports the expected foreign key references via PRAGMA foreign_key_list", () => {
    const db = openDb(":memory:");

    const keystrokeFks = db.prepare("PRAGMA foreign_key_list(trial_keystrokes)").all() as {
      table: string;
      from: string;
      to: string;
    }[];
    expect(keystrokeFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "trial_results", from: "trial_result_id", to: "id" }),
      ]),
    );

    const sessionFks = db.prepare("PRAGMA foreign_key_list(sessions)").all() as {
      table: string;
      from: string;
      to: string;
    }[];
    expect(sessionFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "users", from: "email_hash", to: "email_hash" }),
      ]),
    );
  });

  it("does NOT put a foreign key on otp_codes.email_hash, since OTP request precedes user creation", () => {
    const db = openDb(":memory:");

    // POST /auth/otp/request writes an otp_codes row for a brand-new email
    // before any users row exists for it (the users row is only created in
    // POST /auth/otp/verify) — a FK here would break every first-time login.
    const fks = db.prepare("PRAGMA foreign_key_list(otp_codes)").all();
    expect(fks).toEqual([]);

    expect(() =>
      db
        .prepare(
          `INSERT INTO otp_codes (email_hash, code, expires_at, attempts, requested_at)
           VALUES ('brand-new-hash', '123456', 1700000000000, 0, 1699999999000)`,
        )
        .run(),
    ).not.toThrow();
  });

  it("migrates an existing (pre-FK) database, preserving all data exactly", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    // Reproduces the CURRENT schema verbatim, minus any FOREIGN KEY clause —
    // exactly what a database created before this migration looks like.
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`CREATE TABLE users (
      email_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 0
    )`);
    legacyDb.exec(`CREATE TABLE otp_codes (
      email_hash TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      requested_at INTEGER NOT NULL
    )`);
    legacyDb.exec(`CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
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
      run_id TEXT NOT NULL DEFAULT '',
      run_type TEXT NOT NULL DEFAULT 'level',
      run_trial_id TEXT NOT NULL DEFAULT ''
    )`);
    legacyDb.exec(`CREATE TABLE trial_keystrokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_result_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      t INTEGER NOT NULL
    )`);
    legacyDb.exec(`CREATE TABLE level_stats (
      email_hash TEXT NOT NULL,
      level_number INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      total_time INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      PRIMARY KEY (email_hash, level_number)
    )`);
    legacyDb.exec(`CREATE TABLE level_runs (
      id TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL,
      level_number INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      total_time INTEGER NOT NULL,
      level_completed INTEGER NOT NULL,
      played_at INTEGER NOT NULL,
      server_seq INTEGER NOT NULL DEFAULT 0
    )`);

    legacyDb.exec(
      `INSERT INTO users (email_hash, created_at, is_anonymous) VALUES ('user-hash-1', 1700000000000, 0)`,
    );
    legacyDb.exec(
      `INSERT INTO sessions (token, email_hash, expires_at) VALUES ('token-1', 'user-hash-1', 1700003600000)`,
    );
    legacyDb.exec(
      `INSERT INTO trial_results
         (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, run_id, run_type, run_trial_id)
       VALUES ('user-hash-1', 4, '2dx1d', 1, 0, 1, 0, 3400, 1700000001000, 1, 2, 3, 'run-xyz', 'level', 'trial-xyz')`,
    );
    legacyDb.exec(
      `INSERT INTO trial_keystrokes (trial_result_id, key, t)
       SELECT id, '7', 250 FROM trial_results WHERE run_trial_id = 'trial-xyz'`,
    );
    legacyDb.exec(
      `INSERT INTO level_stats (email_hash, level_number, stars, total_time, completed_at)
       VALUES ('user-hash-1', 4, 2, 5000, 1700000002000)`,
    );
    legacyDb.exec(
      `INSERT INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at, server_seq)
       VALUES ('run-xyz', 'user-hash-1', 4, 2, 5000, 1, 1700000002000, 1)`,
    );
    legacyDb.close();

    const migrated = openDb(dbPath);

    const user = migrated.prepare("SELECT * FROM users WHERE email_hash = 'user-hash-1'").get() as Record<
      string,
      unknown
    >;
    expect(user).toMatchObject({ email_hash: "user-hash-1", created_at: 1700000000000, is_anonymous: 0 });

    const session = migrated.prepare("SELECT * FROM sessions WHERE token = 'token-1'").get() as Record<
      string,
      unknown
    >;
    expect(session).toMatchObject({ email_hash: "user-hash-1", expires_at: 1700003600000 });

    const trial = migrated
      .prepare("SELECT * FROM trial_results WHERE run_trial_id = 'trial-xyz'")
      .get() as Record<string, unknown>;
    expect(trial).toMatchObject({
      email_hash: "user-hash-1",
      level_number: 4,
      category_codename: "2dx1d",
      correct: 1,
      run_id: "run-xyz",
      run_type: "level",
    });

    const keystroke = migrated
      .prepare("SELECT * FROM trial_keystrokes WHERE trial_result_id = ?")
      .get((trial as { id: number }).id) as Record<string, unknown>;
    expect(keystroke).toMatchObject({ key: "7", t: 250 });

    const levelStats = migrated
      .prepare("SELECT * FROM level_stats WHERE email_hash = 'user-hash-1' AND level_number = 4")
      .get() as Record<string, unknown>;
    expect(levelStats).toMatchObject({ stars: 2, total_time: 5000, completed_at: 1700000002000 });

    const levelRun = migrated.prepare("SELECT * FROM level_runs WHERE id = 'run-xyz'").get() as Record<
      string,
      unknown
    >;
    expect(levelRun).toMatchObject({
      email_hash: "user-hash-1",
      level_number: 4,
      stars: 2,
      total_time: 5000,
      level_completed: 1,
      server_seq: 1,
    });
  });

  it("is idempotent — reopening an already-migrated database does not rebuild again or duplicate constraints", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "twice.sqlite");

    openDb(dbPath).close(); // first open: fresh DB, created with FKs from CREATE TABLE directly
    const db = openDb(dbPath); // second open: already has FKs — must not rebuild again

    const fks = db.prepare("PRAGMA foreign_key_list(level_runs)").all() as { table: string }[];
    expect(fks).toHaveLength(1);
    expect(fks[0].table).toBe("users");
  });

  it("enforces foreign keys on a migrated (rebuilt) database, not just a freshly created one", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "old.sqlite");

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`CREATE TABLE users (
      email_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 0
    )`);
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
      run_id TEXT NOT NULL DEFAULT '',
      run_type TEXT NOT NULL DEFAULT 'level',
      run_trial_id TEXT NOT NULL DEFAULT ''
    )`);
    legacyDb.exec(`CREATE TABLE trial_keystrokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_result_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      t INTEGER NOT NULL
    )`);
    legacyDb.close();

    const migrated = openDb(dbPath);

    expect(() =>
      migrated
        .prepare(`INSERT INTO trial_keystrokes (trial_result_id, key, t) VALUES (999999, '5', 100)`)
        .run(),
    ).toThrow();
  });
});
