import { describe, it, expect } from "vitest";
import { openDb } from "../db.js";
import { evaluateTrialResult, type TrialResultInput, type LevelRunSummary } from "./logic.js";
import {
  getLevelStatsRow,
  upsertLevelStatsRow,
  getAllLevelStatsForUser,
  upsertLevelStatsIfBetter,
  insertTrialResults,
  getTrialResultsForUser,
  getKeystrokesForTrialResult,
  insertLevelRuns,
  getLevelRunsForUser,
  mergeAnonymousIdentity,
} from "./repo.js";

const baseTrialInput: TrialResultInput = {
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

describe("getLevelStatsRow / upsertLevelStatsRow / getAllLevelStatsForUser", () => {
  it("returns undefined when there's no record yet", () => {
    const db = openDb(":memory:");
    expect(getLevelStatsRow(db, "hash-1", 3)).toBeUndefined();
  });

  it("inserts a fresh record", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 3, 2, 5000, 1000);

    expect(getLevelStatsRow(db, "hash-1", 3)).toEqual({
      email_hash: "hash-1",
      level_number: 3,
      stars: 2,
      total_time: 5000,
      completed_at: 1000,
    });
  });

  it("overwrites on conflict (same user + level)", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 3, 2, 5000, 1000);
    upsertLevelStatsRow(db, "hash-1", 3, 3, 4000, 2000);

    expect(getLevelStatsRow(db, "hash-1", 3)).toEqual({
      email_hash: "hash-1",
      level_number: 3,
      stars: 3,
      total_time: 4000,
      completed_at: 2000,
    });
  });

  it("returns every level for a user, and none for another", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 1, 3, 1000, 100);
    upsertLevelStatsRow(db, "hash-1", 2, 1, 2000, 200);
    upsertLevelStatsRow(db, "hash-2", 1, 2, 1500, 150);

    const rows = getAllLevelStatsForUser(db, "hash-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.level_number).sort()).toEqual([1, 2]);
  });
});

describe("upsertLevelStatsIfBetter", () => {
  it("inserts when there's no existing record", () => {
    const db = openDb(":memory:");
    upsertLevelStatsIfBetter(db, "hash-1", 1, { stars: 1, totalTime: 9000 }, 100);
    expect(getLevelStatsRow(db, "hash-1", 1)?.stars).toBe(1);
  });

  it("overwrites when the candidate has more stars", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 1, 1, 9000, 100);
    upsertLevelStatsIfBetter(db, "hash-1", 1, { stars: 2, totalTime: 9000 }, 200);
    expect(getLevelStatsRow(db, "hash-1", 1)?.stars).toBe(2);
  });

  it("overwrites when same stars but less time", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 1, 2, 9000, 100);
    upsertLevelStatsIfBetter(db, "hash-1", 1, { stars: 2, totalTime: 5000 }, 200);
    expect(getLevelStatsRow(db, "hash-1", 1)?.total_time).toBe(5000);
  });

  it("does not overwrite when the candidate is worse", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "hash-1", 1, 3, 5000, 100);
    upsertLevelStatsIfBetter(db, "hash-1", 1, { stars: 1, totalTime: 1000 }, 200);

    const row = getLevelStatsRow(db, "hash-1", 1);
    expect(row?.stars).toBe(3);
    expect(row?.total_time).toBe(5000);
  });
});

describe("insertTrialResults / getTrialResultsForUser / getKeystrokesForTrialResult", () => {
  it("stores a trial and its keystrokes, mapping booleans to 0/1", () => {
    const db = openDb(":memory:");
    const trial = evaluateTrialResult(baseTrialInput);

    insertTrialResults(db, "hash-1", [trial]);

    const rows = getTrialResultsForUser(db, "hash-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
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

    insertTrialResults(db, "hash-1", [trial]);

    expect(getTrialResultsForUser(db, "hash-1")[0].level_number).toBe(0);
  });

  it("only returns trials for the requested user", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "hash-1", [evaluateTrialResult(baseTrialInput)]);
    insertTrialResults(db, "hash-2", [evaluateTrialResult(baseTrialInput)]);

    expect(getTrialResultsForUser(db, "hash-1")).toHaveLength(1);
  });
});

describe("insertLevelRuns / getLevelRunsForUser", () => {
  it("stores a level run", () => {
    const db = openDb(":memory:");
    insertLevelRuns(
      db,
      "hash-1",
      [{ levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true }],
      1000,
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
      played_at: 1000,
    });
  });

  it("ignores a retried insert of the same run id, rather than double-recording it", () => {
    const db = openDb(":memory:");
    const run: LevelRunSummary = { levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true };
    insertLevelRuns(db, "hash-1", [run], 1000);
    insertLevelRuns(db, "hash-1", [run], 2000); // e.g. a retried sync batch

    expect(getLevelRunsForUser(db, "hash-1")).toHaveLength(1);
  });
});

describe("mergeAnonymousIdentity", () => {
  it("re-keys trial_results and level_runs from the anonymous identity to the real one", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "anon-hash", [evaluateTrialResult(baseTrialInput)]);
    insertLevelRuns(
      db,
      "anon-hash",
      [{ levelRunId: "run-1", levelNumber: 3, stars: 2, totalTime: 5000, levelCompleted: true }],
      1000,
    );

    mergeAnonymousIdentity(db, "anon-hash", "real-hash", 2000);

    expect(getTrialResultsForUser(db, "anon-hash")).toHaveLength(0);
    expect(getTrialResultsForUser(db, "real-hash")).toHaveLength(1);
    expect(getLevelRunsForUser(db, "anon-hash")).toHaveLength(0);
    expect(getLevelRunsForUser(db, "real-hash")).toHaveLength(1);
  });

  it("adopts the anonymous identity's level_stats when the real user has no record", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "anon-hash", 1, 3, 5000, 100);

    mergeAnonymousIdentity(db, "anon-hash", "real-hash", 2000);

    expect(getLevelStatsRow(db, "real-hash", 1)?.stars).toBe(3);
  });

  it("keeps the real user's better level_stats record rather than downgrading it", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "anon-hash", 1, 1, 9000, 100);
    upsertLevelStatsRow(db, "real-hash", 1, 3, 4000, 100);

    mergeAnonymousIdentity(db, "anon-hash", "real-hash", 2000);

    expect(getLevelStatsRow(db, "real-hash", 1)?.stars).toBe(3);
  });

  it("upgrades the real user's worse level_stats record with the anonymous one's better record", () => {
    const db = openDb(":memory:");
    upsertLevelStatsRow(db, "anon-hash", 1, 3, 4000, 100);
    upsertLevelStatsRow(db, "real-hash", 1, 1, 9000, 100);

    mergeAnonymousIdentity(db, "anon-hash", "real-hash", 2000);

    expect(getLevelStatsRow(db, "real-hash", 1)?.stars).toBe(3);
  });
});
