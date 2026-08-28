import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "./db.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function columnNames(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  ).map((t) => t.name);
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
    expect(columns).toEqual(expect.arrayContaining(["run_id", "run_type", "hint_shown"]));
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

  it("is idempotent — opening the same database twice does not error or duplicate columns", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "moravec-db-test-"));
    const dbPath = join(tmpDir, "twice.sqlite");

    openDb(dbPath).close();
    const db = openDb(dbPath);

    const columns = columnNames(db, "trial_results");
    expect(columns.filter((c) => c === "run_type")).toHaveLength(1);
    expect(columns.filter((c) => c === "operands")).toHaveLength(1);
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
});
