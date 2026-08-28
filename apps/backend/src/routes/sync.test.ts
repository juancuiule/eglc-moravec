import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { getOtpRow } from "../auth/repo.js";
import { getTrialResultsForUser } from "../sync/repo.js";
import { hashEmail } from "../auth/logic.js";

const TEST_SECRET = "test-secret";
const EMAIL = "player@example.com";

function setup(): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ HASH_SECRET: TEST_SECRET } as NodeJS.ProcessEnv);
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
  id: randomUUID(),
  levelNumber: 5,
  categoryCodename: "2dx1d",
  timeTaken: 3400,
  playedAt: 1_700_000_000_000,
  operands: [12, 5], // 12 * 5 = 60
  answer: 60,
  hintShown: true,
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
      answer: 60,
      correct: 1,
      time_exceeded: 0,
      time_taken: 3400,
      played_at: 1_700_000_000_000,
      hint_shown: 1,
      run_id: "run-xyz",
      run_type: "level",
    });
    expect(JSON.parse(rows[0].operands)).toEqual([12, 5]);
  });

  it("rejects an unauthenticated request", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/sync/results",
      payload: { trials: [trial] },
    });
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

  it("retrying the same trial id does not double-record it", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    // e.g. the client never saw the response and retries the same push.
    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });
    const retryRes = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    expect(retryRes.statusCode).toBe(200);
    expect(getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(1);
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

  it("computes correctness server-side from operands/answer, ignoring whatever the client submits", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    // operands say 12 * 5 = 60, but the submitted answer is wrong
    const mismatchedTrial = { ...trial, id: randomUUID(), answer: 999 };

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
      answer: 999, // the client's submitted (wrong) answer is still recorded as-is
    });
  });
});

// A trial for level `levelNumber`, correct iff `correct`. Category is
// always 1d+1d (solveTime 7000ms), and timeTaken is always well within it.
function trialFor(levelNumber: number, correct: boolean, runId: string) {
  return {
    id: randomUUID(),
    levelNumber,
    categoryCodename: "1d+1d",
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    operands: [3, 4],
    answer: correct ? 7 : 999,
    hintShown: false,
    runId,
    runType: "level" as const,
  };
}

// Every trial in one batch shares a run id — a fresh one per call by
// default, so two batches for the same level (e.g. a replay) are still
// two distinct, independently derived runs.
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

// There's no stored level_stats/level_runs table anymore — every GET
// derives stats fresh from trial_results, so these tests exercise that
// derivation (grouping by run_id, folding to the best run per level)
// through the HTTP surface rather than a repo-level cache.
describe("GET /sync/level-stats (derived from trial_results)", () => {
  it("derives a level record from a synced trial batch", async () => {
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

  it("keeps every run's trials, even one that's no longer the best, as part of the derivation input", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postResults(app, token, batchFor(1, 20, 0)); // run 1: 3 stars
    await postResults(app, token, batchFor(1, 15, 0)); // run 2: 1 star — worse, but still its own run

    // Both runs' trials are in trial_results (20 + 15 rows for level 1)...
    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(35);

    // ...but the derived best-ever record still only reflects the better run.
    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3 });
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

const practiceTrial = {
  id: randomUUID(),
  levelNumber: null,
  categoryCodename: "1dx1d",
  timeTaken: 2200,
  playedAt: 1_700_000_000_000,
  operands: [3, 4],
  answer: 12,
  hintShown: false,
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

  it("never contributes to level-stats for a Practice batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [practiceTrial] },
    });

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
  });
});

describe("GET /sync/trials", () => {
  it("returns the minimal per-trial shape the frontend's stats computation needs", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/trials",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({
      trials: [
        {
          categoryCodename: "2dx1d",
          correct: true,
          timeExceeded: false,
          timeTaken: 3400,
          runType: "level",
        },
      ],
    });
  });

  it("includes both Level and Practice trials, distinguished by runType", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial, practiceTrial] },
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/trials",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().trials.map((t: { runType: string }) => t.runType).sort()).toEqual([
      "level",
      "practice",
    ]);
  });

  it("returns an empty array for a user with no records", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/trials",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json()).toEqual({ trials: [] });
  });

  it("only returns the requesting user's own trials", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    const otherRes = await app.inject({ method: "POST", url: "/auth/device", payload: { deviceId: "d2" } });
    const otherToken = otherRes.json().token as string;

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/trials",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(getRes.json()).toEqual({ trials: [] });
  });

  it("rejects an unauthenticated GET", async () => {
    const { app } = setup();
    const getRes = await app.inject({ method: "GET", url: "/sync/trials" });
    expect(getRes.statusCode).toBe(401);
  });
});
