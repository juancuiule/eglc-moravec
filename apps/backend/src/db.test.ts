import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function columnsOf(db: ReturnType<typeof openDb>, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

describe("openDb", () => {
  it("creates users with is_anonymous on a fresh database", () => {
    const db = openDb(":memory:");
    expect(columnsOf(db, "users")).toEqual(
      expect.arrayContaining(["email_hash", "created_at", "is_anonymous"]),
    );
  });

  it("creates trial_results with client_correct/client_time_exceeded on a fresh database", () => {
    const db = openDb(":memory:");
    expect(columnsOf(db, "trial_results")).toEqual(
      expect.arrayContaining(["correct", "time_exceeded", "client_correct", "client_time_exceeded"]),
    );
  });

  it("creates trial_results with hint_shown/streak_at_submit/hints_available_at_start on a fresh database", () => {
    const db = openDb(":memory:");
    expect(columnsOf(db, "trial_results")).toEqual(
      expect.arrayContaining(["hint_shown", "streak_at_submit", "hints_available_at_start"]),
    );
  });

  it("creates trial_results with run_id and run_type on a fresh database", () => {
    const db = openDb(":memory:");
    const columns = columnsOf(db, "trial_results");
    expect(columns).toEqual(expect.arrayContaining(["run_id", "run_type"]));
    expect(columns).not.toContain("level_run_id");
  });

  it("creates trial_results.id as a client-supplied TEXT primary key", () => {
    const db = openDb(":memory:");
    const info = db.prepare("PRAGMA table_info(trial_results)").all() as {
      name: string;
      type: string;
      pk: number;
    }[];
    const idColumn = info.find((c) => c.name === "id");
    expect(idColumn?.type).toBe("TEXT");
    expect(idColumn?.pk).toBe(1);
  });

  it("creates trial_keystrokes.trial_result_id as TEXT, matching trial_results.id", () => {
    const db = openDb(":memory:");
    const info = db.prepare("PRAGMA table_info(trial_keystrokes)").all() as {
      name: string;
      type: string;
    }[];
    expect(info.find((c) => c.name === "trial_result_id")?.type).toBe("TEXT");
  });

  it("creates a sync_log table for cursor-based incremental sync", () => {
    const db = openDb(":memory:");
    expect(columnsOf(db, "sync_log")).toEqual(
      expect.arrayContaining(["seq", "entity_type", "entity_id", "email_hash", "created_at"]),
    );
  });

  it("does not create a level_stats table — LevelStats is derived client-side from level_runs", () => {
    const db = openDb(":memory:");
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'level_stats'")
      .get();
    expect(row).toBeUndefined();
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
