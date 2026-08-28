import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { getOtpRow } from "../auth/repo.js";
import { getTrialResultsForUser, getKeystrokesForTrialResult, getLevelRunsForUser } from "../sync/repo.js";
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

function trial(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
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
    ...overrides,
  };
}

async function postSync(
  app: FastifyInstance,
  token: string,
  cursor: number,
  trials: ReturnType<typeof trial>[],
) {
  return app.inject({
    method: "POST",
    url: "/sync",
    headers: { authorization: `Bearer ${token}` },
    payload: { cursor, trials },
  });
}

describe("POST /sync — push", () => {
  it("stores trials for the authenticated user", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const t = trial();

    const res = await postSync(app, token, 0, [t]);

    expect(res.statusCode).toBe(200);
    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: t.id,
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

    const keystrokes = getKeystrokesForTrialResult(db, t.id);
    expect(keystrokes.map((k) => ({ key: k.key, t: k.t }))).toEqual(t.keystrokes);
  });

  it("rejects an unauthenticated request", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/sync", payload: { cursor: 0, trials: [trial()] } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed body", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "POST",
      url: "/sync",
      headers: { authorization: `Bearer ${token}` },
      payload: { cursor: 0, trials: [{ oops: true }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a request with no cursor", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "POST",
      url: "/sync",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("stores nothing for another user's requests", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await postSync(app, token, 0, [trial()]);

    const otherUserHash = hashEmail("someone-else@example.com", TEST_SECRET);
    expect(getTrialResultsForUser(db, otherUserHash)).toHaveLength(0);
  });

  it("stores the server's own recomputation, not the client's claim, when they disagree — without rejecting the sync", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    // operands say 12 * 5 = 60, but the client claims a wrong answer was correct
    const res = await postSync(app, token, 0, [trial({ answer: 999, correct: true })]);

    expect(res.statusCode).toBe(200);
    const rows = getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(rows[0]).toMatchObject({
      correct: 0, // server-computed wins
      client_correct: 1, // original claim kept for auditing
    });
  });

  it("ignores a retried push of the same trial id — no duplicate row", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const t = trial();

    await postSync(app, token, 0, [t]);
    await postSync(app, token, 0, [t]); // simulated retry

    expect(getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(1);
  });
});

describe("POST /sync — level_runs are derived, never accepted from the request", () => {
  function trialFor(correct: boolean, runId: string) {
    return trial({
      correct: true, // client's claim is irrelevant — the server recomputes from operands/answer
      operands: [3, 4],
      answer: correct ? 7 : 999,
      categoryCodename: "1d+1d",
      timeTaken: 1000,
      runId,
    });
  }

  function batchFor(correctCount: number, wrongCount: number, runId: string = randomUUID()) {
    return [
      ...Array.from({ length: correctCount }, () => trialFor(true, runId)),
      ...Array.from({ length: wrongCount }, () => trialFor(false, runId)),
    ];
  }

  it("derives a level_runs row from a synced trial batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();

    const res = await postSync(app, token, 0, batchFor(17, 0, runId)); // 17 correct → 2 stars, completed
    expect(res.statusCode).toBe(200);

    const [run] = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(run).toMatchObject({ id: runId, stars: 2, level_completed: 1 });
  });

  it("records a run for every batch, even a worse one", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postSync(app, token, 0, batchFor(20, 0)); // run 1: 3 stars
    await postSync(app, token, 0, batchFor(15, 0)); // run 2: 1 star — worse, but still its own record

    const runs = getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET));
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.stars).sort()).toEqual([1, 3]);
  });

  it("retrying the same run id does not double-record it", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();
    const batch = batchFor(20, 0, runId);

    await postSync(app, token, 0, batch);
    await postSync(app, token, 0, batch); // simulated retry

    expect(getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(1);
  });

  it("never creates a level_runs row for a Practice batch", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await postSync(app, token, 0, [
      trial({ runType: "practice", levelNumber: null, categoryCodename: "1dx1d" }),
    ]);

    expect(getLevelRunsForUser(db, hashEmail(EMAIL, TEST_SECRET))).toHaveLength(0);
  });
});

describe("POST /sync — pull", () => {
  it("does not echo a device's own just-pushed trials/level_runs back to it", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await postSync(app, token, 0, [trial()]);

    expect(res.json()).toMatchObject({ trials: [], levelRuns: [] });
  });

  it("returns another device's already-synced trial to a device starting from cursor 0", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const t = trial();
    await postSync(app, token, 0, [t]);

    // A second device for the same user, starting fresh.
    const res = await postSync(app, token, 0, []);

    expect(res.json().trials).toEqual([
      expect.objectContaining({ id: t.id, categoryCodename: "2dx1d", correct: true }),
    ]);
  });

  it("advances the cursor past what it returns, and a subsequent pull from that cursor is empty", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await postSync(app, token, 0, [trial()]);

    const firstPull = await postSync(app, token, 0, []);
    const newCursor = firstPull.json().cursor as number;
    expect(newCursor).toBeGreaterThan(0);

    const secondPull = await postSync(app, token, newCursor, []);
    expect(secondPull.json()).toMatchObject({ cursor: newCursor, trials: [], levelRuns: [] });
  });

  it("returns a derived level_run to another device pulling from cursor 0", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const runId = randomUUID();
    await postSync(
      app,
      token,
      0,
      Array.from({ length: 20 }, () =>
        trial({ categoryCodename: "1d+1d", operands: [3, 4], answer: 7, correct: true, runId }),
      ),
    );

    const res = await postSync(app, token, 0, []);
    expect(res.json().levelRuns).toEqual([
      expect.objectContaining({ id: runId, stars: 3, levelCompleted: true }),
    ]);
  });

  it("omits keystrokes from a pulled trial", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    await postSync(app, token, 0, [trial()]);

    const res = await postSync(app, token, 0, []);
    expect(res.json().trials[0].keystrokes).toBeUndefined();
  });

  it("GET /sync/level-stats no longer exists", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);
    const res = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
