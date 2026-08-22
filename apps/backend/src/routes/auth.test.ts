import { describe, it, expect, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { getOtpRow } from "../auth/repo.js";
import { hashEmail } from "../auth/logic.js";

const TEST_SECRET = "test-secret";
const EMAIL = "player@example.com";

function setup(env: NodeJS.ProcessEnv = {}): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ EMAIL_HASH_SECRET: TEST_SECRET, ...env } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

function codeFor(db: DatabaseSync, email: string): string {
  const row = getOtpRow(db, hashEmail(email, TEST_SECRET));
  if (!row) throw new Error("no OTP row found — did /auth/otp/request run first?");
  return row.code;
}

describe("POST /auth/otp/request", () => {
  it("stores a code and returns ok", async () => {
    const { db, app } = setup();

    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(getOtpRow(db, hashEmail(EMAIL, TEST_SECRET))).toBeDefined();
  });

  it("rejects an invalid email", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rate-limits a second request for the same email made too soon", async () => {
    const { app } = setup();
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: EMAIL } });
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    expect(res.statusCode).toBe(429);
  });

  it("does not persist the code or arm the rate limit when email delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("boom") }));
    const { db, app } = setup({ RESEND_API_KEY: "fake-key" } as NodeJS.ProcessEnv);

    const failedRes = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    expect(failedRes.statusCode).toBe(502);
    expect(getOtpRow(db, hashEmail(EMAIL, TEST_SECRET))).toBeUndefined();

    // A retry immediately after isn't rate-limited, since the failed attempt never armed it.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const retryRes = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(getOtpRow(db, hashEmail(EMAIL, TEST_SECRET))).toBeDefined();

    vi.unstubAllGlobals();
  });
});

describe("POST /auth/otp/verify", () => {
  it("issues a session token for the correct code", async () => {
    const { db, app } = setup();
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: EMAIL, code: codeFor(db, EMAIL) },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects an incorrect code", async () => {
    const { app } = setup();
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: EMAIL, code: "000000" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects verifying without ever requesting a code", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: EMAIL, code: "123456" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /auth/me + POST /auth/logout", () => {
  async function loginAndGetToken(db: DatabaseSync, app: FastifyInstance): Promise<string> {
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email: EMAIL } });
    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: EMAIL, code: codeFor(db, EMAIL) },
    });
    return verifyRes.json().token as string;
  }

  it("accepts a valid session token", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects a missing or unknown token", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("logout invalidates the session", async () => {
    const { db, app } = setup();
    const token = await loginAndGetToken(db, app);

    await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
