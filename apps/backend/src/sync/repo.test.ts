import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDb } from "../db.js";
import { evaluateTrialResult, type TrialResultInput, type LevelRunSummary } from "./logic.js";
import {
  insertTrialResults,
  getTrialResultsForUser,
  getTrialResultsByIds,
  getKeystrokesForTrialResult,
  insertLevelRuns,
  getLevelRunsForUser,
  getLevelRunsByIds,
  getSyncLogSince,
  mergeAnonymousIdentity,
} from "./repo.js";

const baseTrialInput: TrialResultInput = {
  id: "trial-abc",
  levelNumber: 3,
  categoryCodename: "1d+1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "9", t: 100 }, { key: "2", t: 340 }],
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  streakAtSubmit: 2,
  hintsAvailableAtStart: 3,
  runId: "run-abc",
  runType: "level",
};

describe("insertTrialResults / getTrialResultsForUser / getKeystrokesForTrialResult", () => {
  it("stores a trial (keyed by its client-generated id) and its keystrokes, mapping booleans to 0/1", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial], 1000);

    const rows = getTrialResultsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "trial-abc",
      email_hash: "hash-1",
      level_number: 3,
      category_codename: "1d+1d",
      correct: 1,
      time_exceeded: 0,
      run_id: "run-abc",
      run_type: "level",
    });

    const keystrokes = getKeystrokesForTrialResult(db, rows[0].id);
    expect(keystrokes.map((k) => [k.key, k.t])).toEqual([["9", 100], ["2", 340]]);
  });

  it("materializes a null levelNumber (Practice) as 0", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult({ ...baseTrialInput, levelNumber: null, runType: "practice" });

    insertTrialResults(db, "hash-1", [trial], 1000);

    expect(getTrialResultsForUser(db, "hash-1")[0].level_number).toBe(0);
  });

  it("only returns trials for the requested user", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult(baseTrialInput)], 1000);
    insertTrialResults(
      db,
      "hash-2",
      [evaluateTrialResult({ ...baseTrialInput, id: randomUUID() })],
      1000,
    );

    expect(getTrialResultsForUser(db, "hash-1")).toHaveLength(1);
  });

  it("ignores a retried insert of the same trial id, rather than double-recording it or its keystrokes", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial], 1000);
    insertTrialResults(db, "hash-1", [trial], 2000); // e.g. a retried sync batch

    const rows = getTrialResultsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(getKeystrokesForTrialResult(db, rows[0].id)).toHaveLength(2); // not 4
  });

  it("fetches specific trials by id", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult(baseTrialInput)], 1000);
    const otherId = randomUUID();
    insertTrialResults(
      db,
      "hash-1",
      [evaluateTrialResult({ ...baseTrialInput, id: otherId })],
      1000,
    );

    expect(getTrialResultsByIds(db, ["trial-abc"])).toHaveLength(1);
    expect(getTrialResultsByIds(db, [otherId, "trial-abc"])).toHaveLength(2);
    expect(getTrialResultsByIds(db, [])).toHaveLength(0);
  });
});

describe("insertLevelRuns / getLevelRunsForUser", () => {
  it("stores a level run, using the run's own playedAt — not the sync-time `now` argument", () => {
    const db = openDb(":memory:");
    insertLevelRuns(
      db,
      "hash-1",
      [{ levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true, playedAt: 500 }],
      1000, // sync time — deliberately different from playedAt, to prove which one wins
    );

    const rows = getLevelRunsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "run-1",
      email_hash: "hash-1",
      level_number: 3,
      stars: 2,
      total_time: 5000,
      level_completed: 1,
      played_at: 500,
    });
  });

  it("ignores a retried insert of the same run id, rather than double-recording it", () => {
    const db = openDb(":memory:");
    const run: LevelRunSummary = { levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true, playedAt: 500 };
    insertLevelRuns(db, "hash-1", [run], 1000);
    insertLevelRuns(db, "hash-1", [run], 2000); // e.g. a retried sync batch

    expect(getLevelRunsForUser(db, "hash-1")).toHaveLength(1);
  });

  it("fetches specific level runs by id", () => {
    const db = openDb(":memory:");
    insertLevelRuns(
      db,
      "hash-1",
      [{ levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true, playedAt: 500 }],
      1000,
    );

    expect(getLevelRunsByIds(db, ["run-1"])).toHaveLength(1);
    expect(getLevelRunsByIds(db, ["nonexistent"])).toHaveLength(0);
  });
});

describe("sync_log", () => {
  it("logs a new trial insert, but not a retried duplicate", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial], 1000);
    insertTrialResults(db, "hash-1", [trial], 2000); // retried — must not log again

    const log = getSyncLogSince(db, "hash-1", 0);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entityType: "trial_result", entityId: "trial-abc" });
  });

  it("logs a new level run insert, but not a retried duplicate", () => {
    const db = openDb(":memory:");
    const run: LevelRunSummary = { levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true, playedAt: 500 };

    insertLevelRuns(db, "hash-1", [run], 1000);
    insertLevelRuns(db, "hash-1", [run], 2000); // retried

    const log = getSyncLogSince(db, "hash-1", 0);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entityType: "level_run", entityId: "run-1" });
  });

  it("only returns entries after the given cursor, in seq order, for the requested user", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult(baseTrialInput)], 1000);
    insertTrialResults(
      db,
      "hash-1",
      [evaluateTrialResult({ ...baseTrialInput, id: "trial-2" })],
      1000,
    );
    insertTrialResults(
      db,
      "hash-2",
      [evaluateTrialResult({ ...baseTrialInput, id: "trial-3" })],
      1000,
    );

    const [first] = getSyncLogSince(db, "hash-1", 0);
    const sinceFirst = getSyncLogSince(db, "hash-1", first.seq);

    expect(sinceFirst).toHaveLength(1);
    expect(sinceFirst[0].entityId).toBe("trial-2");
  });
});

describe("mergeAnonymousIdentity", () => {
  it("re-keys trial_results, level_runs, and sync_log from the anonymous identity to the real one", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "anon-hash", [evaluateTrialResult(baseTrialInput)], 1000);
    insertLevelRuns(
      db,
      "anon-hash",
      [{ levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true, playedAt: 500 }],
      1000,
    );

    mergeAnonymousIdentity(db, "anon-hash", "real-hash");

    expect(getTrialResultsForUser(db, "anon-hash")).toHaveLength(0);
    expect(getTrialResultsForUser(db, "real-hash")).toHaveLength(1);
    expect(getLevelRunsForUser(db, "anon-hash")).toHaveLength(0);
    expect(getLevelRunsForUser(db, "real-hash")).toHaveLength(1);
    expect(getSyncLogSince(db, "anon-hash", 0)).toHaveLength(0);
    expect(getSyncLogSince(db, "real-hash", 0)).toHaveLength(2); // the trial + the level run
  });

  it("keeps a device's cursor numerically valid after the merge — no entries are lost or renumbered", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "anon-hash", [evaluateTrialResult(baseTrialInput)], 1000);
    const [before] = getSyncLogSince(db, "anon-hash", 0);

    mergeAnonymousIdentity(db, "anon-hash", "real-hash");

    const [after] = getSyncLogSince(db, "real-hash", 0);
    expect(after.seq).toBe(before.seq);
    expect(after.entityId).toBe(before.entityId);
  });
});
