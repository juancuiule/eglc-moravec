import { describe, it, expect } from "vitest";
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
      time_taken: 3400,
      played_at: 1_700_000_000_000,
    });
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
});

describe("POST /sync/level-stats + GET /sync/level-stats", () => {
  it("stores a level record and returns it on GET", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const postRes = await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
      payload: { levelNumber: 4, stars: 2, totalTime: 30000 },
    });
    expect(postRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().levelStats["4"]).toMatchObject({ stars: 2, totalTime: 30000 });
  });

  it("does not downgrade an existing better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
      payload: { levelNumber: 1, stars: 3, totalTime: 10000 },
    });
    await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
      payload: { levelNumber: 1, stars: 1, totalTime: 5000 },
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3, totalTime: 10000 });
  });

  it("upgrades to a better record", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
      payload: { levelNumber: 1, stars: 1, totalTime: 10000 },
    });
    await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
      payload: { levelNumber: 1, stars: 3, totalTime: 8000 },
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.json().levelStats["1"]).toMatchObject({ stars: 3, totalTime: 8000 });
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

  it("rejects unauthenticated requests on both routes", async () => {
    const { app } = setup();
    const postRes = await app.inject({
      method: "POST",
      url: "/sync/level-stats",
      payload: { levelNumber: 1, stars: 1, totalTime: 1000 },
    });
    expect(postRes.statusCode).toBe(401);

    const getRes = await app.inject({ method: "GET", url: "/sync/level-stats" });
    expect(getRes.statusCode).toBe(401);
  });
});
