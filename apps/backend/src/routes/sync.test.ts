import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { getOtpRow } from "../auth/repo.js";
import {
  getTrialResultsForUser,
  getKeystrokesForTrialResult,
  getLevelRunsForUser,
} from "../sync/repo.js";
import { hashEmail } from "../auth/logic.js";

const TEST_SECRET = "test-secret";
const EMAIL = "player@example.com";

function setup(): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ EMAIL_HASH_SECRET: TEST_SECRET } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

async function loginAndGetToken(db: DatabaseSync, app: FastifyInstance): Promise<string> {
  await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: EMAIL } });
  const row = getOtpRow(db, hashEmail(EMAIL, TEST_SECRET));
  const verifyRes = await app.inject({
    method: "POST",
    url: "/auth/otp/verify",
    payload: { email: EMAIL, code: row!.code },
  });
  return verifyRes.json().token as string;
}

const trial = {
  levelNumber: 5,
  categoryCodename: "2dx1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 3400,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "4", t: 120 }, { key: "2", t: 890 }],
  operands: [12, 5], // 12 * 5 = 60
  answer: 60,
  hintShown: true,
  streakAtSubmit: 4,
  hintsAvailableAtStart: 3,
  runId: "run-xyz",
  runType: "level" as const,
};

describe("POST /sync/results", () => {
  it("stores trials for the authenticated user", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stored: 1 });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      level_number: 5,
      category_codename: "2dx1d",
      correct: 1,
      time_exceeded: 0,
      client_correct: 1,
      client_time_exceeded: 0,
      time_taken: 3400,
      played_at: 1_700_000_000_000,
      hint_shown: 1,
      streak_at_submit: 4,
      hints_available_at_start: 3,
      run_id: "run-xyz",
      run_type: "level",
    });

    const keystrokes = getKeystrokesForTrialResult(db, rows[0].id);
    expect(keystrokes).toHaveLength(2);
    expect(keystrokes.map((k) => ({ key: k.key, t: k.t }))).toEqual(trial.keystrokes);
  });

  it("rejects an unauthenticated request", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/sync/results", payload: { trials: [trial] } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed body", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [{ oops: true }] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("stores nothing for another user's requests", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    const otherUserHash = hashEmail("someone-else@example.com", TEST_SECRET);
    expect(getTrialResultsForUser(db, otherUserHash)).toHaveLength(0);
  });

  it("stores the server's own recomputation, not the client's claim, when they disagree — without rejecting the sync", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    // operands say 12 * 5 = 60, but the client claims a wrong answer was correct
    const mismatchedTrial = { ...trial, answer: 999, correct: true };

    const res = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [mismatchedTrial] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stored: 1 });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows[0]).toMatchObject({
      correct: 0, // server-computed wins
      client_correct: 1, // original claim kept for auditing
    });
  });
});

// A trial for level `levelNumber`, correct iff `correct`. Category is
// always 1d+1d (solveTime 7000ms), and timeTaken is always well within it.
function trialFor(levelNumber: number, correct: boolean, runId: string) {
  return {
    levelNumber,
    categoryCodename: "1d+1d",
    correct: true, // client's claim is irrelevant here — the server recomputes from operands/answer
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    operands: [3, 4],
    answer: correct ? 7 : 999,
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId,
    runType: "level" as const,
  };
}

// Every trial in one batch shares a run id — a fresh one per call by
// default, so two batches for the same level (e.g. a replay) are still
// two distinct, independently recorded runs.
function batchFor(
  levelNumber: number,
  correctCount: number,
  wrongCount: number,
  runId: string = randomUUID(),
) {
  return [
    ...Array.from({ length: correctCount }, () => trialFor(levelNumber, true, runId)),
    ...Array.from({ length: wrongCount }, () => trialFor(levelNumber, false, runId)),
  ];
}

async function postResults(
  app: FastifyInstance,
  token: string,
  trials: ReturnType<typeof trialFor>[],
) {
  return app.inject({
    method: "POST",
    url: "/sync/results",
    headers: { authorization: `Bearer ${token}` },
    payload: { trials },
  });
}

describe("GET /sync/level-stats (derived from POST /sync/results)", () => {
  it("derives and stores a level record from a synced trial batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await postResults(app, token, batchFor(4, 17, 0)); // 17 correct → 2 stars
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().levelStats["4"]).toMatchObject({ stars: 2, totalTime: 17000 });
  });

  it("does not downgrade an existing better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postResults(app, token, batchFor(1, 20, 0)); // 3 stars
    await postResults(app, token, batchFor(1, 15, 0)); // worse: 1 star

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3, totalTime: 20000 });
  });

  it("upgrades to a better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postResults(app, token, batchFor(1, 15, 0)); // 1 star
    await postResults(app, token, batchFor(1, 20, 0)); // better: 3 stars

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3, totalTime: 20000 });
  });

  it("GET returns an empty object for a user with no records", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json()).toEqual({ levelStats: {} });
  });

  it("rejects an unauthenticated GET", async () => {
    const { app } = setup();
    const getRes = await app.inject({ method: "GET", url: "/sync/level-stats" });
    expect(getRes.statusCode).toBe(401);
  });
});

describe("level_runs (every attempt, not just the best)", () => {
  it("records a run for each sync, even when a later run is worse", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postResults(app, token, batchFor(1, 20, 0)); // run 1: 3 stars
    await postResults(app, token, batchFor(1, 15, 0)); // run 2: 1 star — worse, but still its own record

    const runs = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.stars).sort()).toEqual([1, 3]);

    // level_stats (the best-ever cache) still only reflects the better run
    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3 });
  });

  it("each run keeps its own levelRunId as the row id", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();

    await postResults(app, token, batchFor(2, 17, 0, runId));

    const [run] = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(run.id).toBe(runId);
    expect(run.level_number).toBe(2);
    expect(run.level_completed).toBe(1);
  });

  it("retrying the same run id does not double-record it", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();
    const batch = batchFor(1, 20, 0, runId);

    await postResults(app, token, batch);
    await postResults(app, token, batch); // simulated retry of the exact same batch

    const runs = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(runs).toHaveLength(1);
  });
});

const practiceTrial = {
  levelNumber: null,
  categoryCodename: "1dx1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 2200,
  playedAt: 1_700_000_000_000,
  keystrokes: [],
  operands: [3, 4],
  answer: 12,
  hintShown: false,
  streakAtSubmit: 1,
  hintsAvailableAtStart: 0,
  runId: "practice-run-1",
  runType: "practice" as const,
};

describe("POST /sync/results with Practice trials", () => {
  it("stores a Practice trial with the level_number sentinel and run_type practice", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [practiceTrial] },
    });

    expect(res.statusCode).toBe(200);
    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      level_number: 0,
      run_type: "practice",
      run_id: "practice-run-1",
      category_codename: "1dx1d",
    });
  });

  it("never creates a level_runs row or updates level_stats for a Practice batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [practiceTrial] },
    });

    expect(getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(0);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json()).toEqual({ levelStats: {} });
  });

  it("stores a mixed batch's Level and Practice trials independently", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial, practiceTrial] },
    });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.run_type).sort()).toEqual(["level", "practice"]);

    // Only the Level trial produces a level_runs row.
    expect(getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(1);
  });
});
