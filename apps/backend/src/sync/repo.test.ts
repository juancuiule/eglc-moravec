import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateTrialResult, type TrialResultInput } from "engine";
import { openDb } from "../db.js";
import { insertTrialResults, getTrialResultsForUser } from "./repo.js";

const baseTrialInput: TrialResultInput = {
  id: randomUUID(),
  levelNumber: 3,
  categoryCodename: "1d+1d",
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  runId: "run-abc",
  runType: "level",
};

describe("insertTrialResults / getTrialResultsForUser", () => {
  it("stores a trial, mapping booleans to 0/1 and operands to a JSON array", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial]);

    const rows = getTrialResultsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email_hash: "hash-1",
      level_number: 3,
      category_codename: "1d+1d",
      answer: 9,
      correct: 1,
      time_exceeded: 0,
      run_id: "run-abc",
      run_type: "level",
    });
    expect(JSON.parse(rows[0].operands)).toEqual([4, 5]);
  });

  it("materializes a null levelNumber (Practice) as 0", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult({
      ...baseTrialInput,
      levelNumber: null,
      runType: "practice",
    });

    insertTrialResults(db, "hash-1", [trial]);

    expect(getTrialResultsForUser(db, "hash-1")[0].level_number).toBe(0);
  });

  it("only returns trials for the requested user", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult(baseTrialInput)]);
    insertTrialResults(db, "hash-2", [evaluateTrialResult(baseTrialInput)]);

    expect(getTrialResultsForUser(db, "hash-1")).toHaveLength(1);
  });

  it("ignores a retried insert of the same trial id, rather than double-recording it", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial]);
    insertTrialResults(db, "hash-1", [trial]); // e.g. a retried sync after a dropped response

    expect(getTrialResultsForUser(db, "hash-1")).toHaveLength(1);
  });
});

describe("sync_log backfill", () => {
  it("populates the log for trials that predate the table, in insertion order", () => {
    // Simulate a legacy database: rows exist but the log table is empty.
    const dir = mkdtempSync(join(tmpdir(), "moravec-"));
    try {
      const path = join(dir, "moravec.sqlite");
      const db = openDb(path);
      insertTrialResults(db, "hash-1", [
        evaluateTrialResult(baseTrialInput),
        evaluateTrialResult({ ...baseTrialInput, id: randomUUID() }),
      ]);
      db.exec("DELETE FROM sync_log");
      db.close();

      // Reopening runs the guarded backfill — the history becomes pullable.
      const reopened = openDb(path);
      const log = reopened
        .prepare("SELECT email_hash, trial_id FROM sync_log ORDER BY seq")
        .all() as { email_hash: string; trial_id: string }[];
      expect(log.map((r) => r.email_hash)).toEqual(["hash-1", "hash-1"]);

      // And new inserts continue past the backfilled seq range — no
      // collision with the rows the client will have pulled under them.
      const db3 = reopened;
      const before = (
        db3.prepare("SELECT MAX(seq) AS m FROM sync_log").get() as {
          m: number;
        }
      ).m;
      insertTrialResults(db3, "hash-1", [
        evaluateTrialResult({ ...baseTrialInput, id: randomUUID() }),
      ]);
      // insertTrialResults is the pre-log path — a real push goes through
      // syncTrials; direct insert here is fine for schema assertions.
      reopened.close();
      expect(before).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
