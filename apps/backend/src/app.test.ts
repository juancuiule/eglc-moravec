import { describe, it, expect } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "./db.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { getOtpRow } from "./auth/repo.js";
import { hashEmail } from "./auth/logic.js";

const TEST_SECRET = "test-secret";
const EMAIL = "player@example.com";
const testConfig = loadConfig({ EMAIL_HASH_SECRET: TEST_SECRET } as NodeJS.ProcessEnv);

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

describe("GET /health", () => {
  it("returns 200 with db: true when the database is reachable", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: true });
  });

  it("returns 503 with db: false once the database is closed", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);
    db.close();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "degraded", db: false });
  });
});

describe("global error handler", () => {
  it("returns a generic 500 body for an unhandled throw, not the raw error message", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);
    const token = await loginAndGetToken(db, app);

    // categoryCodename doesn't match a known category — sync/logic.ts's
    // manual validator lets this through, and reconstructOperation() then
    // throws a plain Error with the codename in its message.
    const trial = {
      levelNumber: 1,
      categoryCodename: "garbage",
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: 1_700_000_000_000,
      keystrokes: [],
      operands: [1, 2],
      answer: 3,
      hintShown: false,
      streakAtSubmit: 0,
      hintsAvailableAtStart: 0,
      runId: "run-1",
      runType: "level" as const,
    };

    const response = await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token}` },
      payload: { trials: [trial] },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.body).not.toContain("garbage");
    expect(response.body).not.toContain("Unknown operation");
  });

  it("returns the response with a generic body for a Fastify-level 4xx, not the raw parser error", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);

    const response = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      headers: { "content-type": "application/json" },
      payload: "{not valid json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
    expect(response.body).not.toContain("Unexpected token");
  });
});
