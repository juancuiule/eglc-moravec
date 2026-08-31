import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateTrialResult, type TrialResultInput } from "engine";
import { openDb } from "../db.js";
import {
  insertTrialResults,
  getTrialResultsForUser,
  mergeAnonymousIdentity,
} from "./repo.js";

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

describe("mergeAnonymousIdentity", () => {
  it("re-keys trial_results from the anonymous identity to the real one", () => {
    const db = openDb(":memory:");
    insertTrialResults(db, "anon-hash", [evaluateTrialResult(baseTrialInput)]);

    mergeAnonymousIdentity(db, "anon-hash", "real-hash", 2000);

    expect(getTrialResultsForUser(db, "anon-hash")).toHaveLength(0);
    expect(getTrialResultsForUser(db, "real-hash")).toHaveLength(1);
  });
});
