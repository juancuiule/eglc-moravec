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

async function pushTrials(app: FastifyInstance, token: string | undefined, trials: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/sync/trial-results/push",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: { trials },
  });
}

const trial = {
  id: "trial-1",
  levelNumber: 5,
  categoryCodename: "2dx1d",
  clientCorrect: true,
  clientTimeExceeded: false,
  timeTaken: 3400,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "4", t: 120 }, { key: "2", t: 890 }],
  operands: [12, 5], // 12 * 5 = 60
  answer: 60,
  hintShown: true,
  streakAtSubmit: 4,
  hintsAvailableAtStart: 3,
  levelRunId: "run-xyz",
};

describe("POST /sync/trial-results/push", () => {
  it("stores a pushed Trial and returns it back enriched with the server's authoritative correctness", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await pushTrials(app, token, [trial]);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      trials: [{ ...trial, correct: true, timeExceeded: false }],
    });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "trial-1",
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
      level_run_id: "run-xyz",
    });

    const keystrokes = getKeystrokesForTrialResult(db, rows[0].id);
    expect(keystrokes).toHaveLength(2);
    expect(keystrokes.map((k) => ({ key: k.key, t: k.t }))).toEqual(trial.keystrokes);
  });

  it("rejects an unauthenticated request", async () => {
    const { app } = setup();
    const res = await pushTrials(app, undefined, [trial]);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed body", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await pushTrials(app, token, [{ oops: true }]);

    expect(res.statusCode).toBe(400);
  });

  it("stores nothing for another user's requests", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await pushTrials(app, token, [trial]);

    const otherUserHash = hashEmail("someone-else@example.com", TEST_SECRET);
    expect(getTrialResultsForUser(db, otherUserHash)).toHaveLength(0);
  });

  it("stores the server's own recomputation, not the client's claim, when they disagree — without rejecting the push", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    // operands say 12 * 5 = 60, but the client claims a wrong answer was correct
    const mismatchedTrial = { ...trial, answer: 999, clientCorrect: true };

    const res = await pushTrials(app, token, [mismatchedTrial]);

    expect(res.statusCode).toBe(200);
    expect(res.json().trials[0]).toMatchObject({
      correct: false, // server-computed wins
      clientCorrect: true, // original claim kept for auditing
    });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows[0]).toMatchObject({
      correct: 0,
      client_correct: 1,
    });
  });

  it("retrying an already-pushed Trial (same id) does not double-insert it, and still returns its authoritative correctness", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await pushTrials(app, token, [trial]);
    const retryRes = await pushTrials(app, token, [trial]); // simulated retry of the exact same push

    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.json().trials[0]).toMatchObject({ id: "trial-1", correct: true, timeExceeded: false });

    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(1);
  });

  it("falls back to this request's own recomputation, without crashing, if the id collides with a different user's Trial", async () => {
    const { db, app } = setup();
    const tokenA = await loginAndGetToken(db, app); // player@example.com
    await pushTrials(app, tokenA, [trial]); // "trial-1" now belongs to player@example.com

    // A different account pushes a Trial under the exact same id —
    // astronomically unlikely in reality (ids are UUIDs) but simulated
    // directly here since it can't be forced through the real generator.
    const otherEmail = "someone-else@example.com";
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: otherEmail } });
    const rowB = getOtpRow(db, hashEmail(otherEmail, TEST_SECRET));
    const verifyB = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: otherEmail, code: rowB!.code },
    });
    const tokenB = verifyB.json().token as string;

    const res = await pushTrials(app, tokenB, [trial]);

    expect(res.statusCode).toBe(200); // never a 500, even on this collision
    expect(res.json().trials[0]).toMatchObject({ id: "trial-1", correct: true, timeExceeded: false });

    // The colliding id was never actually recorded for the second user —
    // INSERT OR IGNORE silently no-oped since the id already belonged to
    // the first user.
    expect(getTrialResultsForUser(db, hashEmail(otherEmail, TEST_SECRET))).toHaveLength(0);
  });
});

// A trial for level `levelNumber`, correct-in-time iff `correct`. Category
// is always 1d+1d (solveTime 7000ms), so a 1000ms trial is always in time.
function trialFor(levelNumber: number, correct: boolean, levelRunId: string) {
  return {
    id: randomUUID(),
    levelNumber,
    categoryCodename: "1d+1d",
    clientCorrect: true, // client's claim is irrelevant here — the server recomputes from operands/answer
    clientTimeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    operands: [3, 4],
    answer: correct ? 7 : 999,
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    levelRunId,
  };
}

// Every trial in one batch shares a run id — a fresh one per call by
// default, so two batches for the same level (e.g. a replay) are still
// two distinct, independently recorded runs.
function batchFor(
  levelNumber: number,
  correctCount: number,
  wrongCount: number,
  levelRunId: string = randomUUID(),
) {
  return [
    ...Array.from({ length: correctCount }, () => trialFor(levelNumber, true, levelRunId)),
    ...Array.from({ length: wrongCount }, () => trialFor(levelNumber, false, levelRunId)),
  ];
}

// GET /sync/level-stats returns a flat array (each entry self-identifies by
// levelNumber, the RxDB primary key it's a pull source for), not an object
// keyed by level number.
function findLevelStat(
  levelStats: { levelNumber: number }[],
  levelNumber: number,
): { levelNumber: number } | undefined {
  return levelStats.find((s) => s.levelNumber === levelNumber);
}

describe("GET /sync/level-stats (derived from POST /sync/trial-results/push)", () => {
  it("derives and stores a level record from a synced trial batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await pushTrials(app, token, batchFor(4, 17, 0)); // 17 correct-in-time → 2 stars
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(findLevelStat(getRes.json().levelStats, 4)).toMatchObject({ stars: 2, totalTime: 17000 });
  });

  it("does not downgrade an existing better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await pushTrials(app, token, batchFor(1, 20, 0)); // 3 stars
    await pushTrials(app, token, batchFor(1, 15, 0)); // worse: 1 star

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(findLevelStat(getRes.json().levelStats, 1)).toMatchObject({ stars: 3, totalTime: 20000 });
  });

  it("upgrades to a better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await pushTrials(app, token, batchFor(1, 15, 0)); // 1 star
    await pushTrials(app, token, batchFor(1, 20, 0)); // better: 3 stars

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(findLevelStat(getRes.json().levelStats, 1)).toMatchObject({ stars: 3, totalTime: 20000 });
  });

  it("GET returns an empty array for a user with no records", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json()).toEqual({ levelStats: [] });
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

    await pushTrials(app, token, batchFor(1, 20, 0)); // run 1: 3 stars
    await pushTrials(app, token, batchFor(1, 15, 0)); // run 2: 1 star — worse, but still its own record

    const runs = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.stars).sort()).toEqual([1, 3]);

    // level_stats (the best-ever cache) still only reflects the better run
    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(findLevelStat(getRes.json().levelStats, 1)).toMatchObject({ stars: 3 });
  });

  it("each run keeps its own levelRunId as the row id", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();

    await pushTrials(app, token, batchFor(2, 17, 0, runId));

    const [run] = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(run.id).toBe(runId);
    expect(run.level_number).toBe(2);
    expect(run.level_completed).toBe(1);
  });

  it("retrying the same batch (same run id, same trial ids) does not double-record the run", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();
    const batch = batchFor(1, 20, 0, runId);

    await pushTrials(app, token, batch);
    await pushTrials(app, token, batch); // simulated retry of the exact same batch

    const runs = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(runs).toHaveLength(1);
  });
});
