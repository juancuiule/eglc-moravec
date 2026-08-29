import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { getOtpRow } from "../auth/repo.js";
import { hashEmail, hashDeviceId } from "../auth/logic.js";
import { getTrialResultsForUser } from "../sync/repo.js";

const TEST_SECRET = "test-secret";
const EMAIL = "player@example.com";

function setup(env: NodeJS.ProcessEnv = {}): {
  db: DatabaseSync;
  app: FastifyInstance;
} {
  const db = openDb(":memory:");
  const config = loadConfig({
    HASH_SECRET: TEST_SECRET,
    ...env,
  } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

function codeFor(db: DatabaseSync, email: string): string {
  const row = getOtpRow(db, hashEmail(email, TEST_SECRET));
  if (!row)
    throw new Error("no OTP row found — did /auth/otp/request run first?");
  return row.code;
}

// A minimal, valid /sync/results trial — level/category/operands don't
// matter for these tests, only that the payload is accepted.
const trial = {
  id: randomUUID(),
  levelNumber: 5,
  categoryCodename: "1d+1d",
  timeTaken: 1000,
  playedAt: 1_700_000_000_000,
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  runId: "run-1",
  runType: "level" as const,
};

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
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    expect(res.statusCode).toBe(429);
  });

  it("only one of two concurrent requests for the same email wins the rate-limit slot", async () => {
    // sendOtpEmail's fetch call is what actually yields to the event loop —
    // without the atomic reserve, both requests would read the same "no
    // prior request" snapshot before either finished sending and won.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ ok: true }), 5),
            ),
        ),
    );
    const { app } = setup({ RESEND_API_KEY: "fake-key" } as NodeJS.ProcessEnv);

    const [resA, resB] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/auth/otp/request",
        payload: { email: EMAIL },
      }),
      app.inject({
        method: "POST",
        url: "/auth/otp/request",
        payload: { email: EMAIL },
      }),
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    expect(statusCodes).toEqual([200, 429]);

    vi.unstubAllGlobals();
  });

  it("does not persist the code or arm the rate limit when email delivery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      }),
    );
    const { db, app } = setup({
      RESEND_API_KEY: "fake-key",
    } as NodeJS.ProcessEnv);

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
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });

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
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });

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
  async function loginAndGetToken(
    db: DatabaseSync,
    app: FastifyInstance,
  ): Promise<string> {
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
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

describe("POST /auth/device", () => {
  it("issues a session token for a new device id", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/auth/device",
      payload: { deviceId: "device-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects a missing deviceId", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/auth/device",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("two sessions for the same device id share one identity", async () => {
    const { db, app } = setup();
    const res1 = await app.inject({
      method: "POST",
      url: "/auth/device",
      payload: { deviceId: "device-1" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/auth/device",
      payload: { deviceId: "device-1" },
    });
    const token1 = res1.json().token as string;
    const token2 = res2.json().token as string;
    expect(token1).not.toBe(token2);

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token1}` },
      payload: { trials: [trial] },
    });
    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${token2}` },
      payload: { trials: [{ ...trial, id: randomUUID(), runId: "run-2" }] },
    });

    const deviceEmailHash = hashDeviceId("device-1", TEST_SECRET);
    expect(getTrialResultsForUser(db, deviceEmailHash)).toHaveLength(2);
  });
});

describe("anonymous → email upgrade merge", () => {
  it("merges an anonymous identity's trials into the new email account on login", async () => {
    const { db, app } = setup();

    const deviceRes = await app.inject({
      method: "POST",
      url: "/auth/device",
      payload: { deviceId: "device-1" },
    });
    const anonToken = deviceRes.json().token as string;

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${anonToken}` },
      // 20 correct → completes the level; each needs its own id, since id is
      // now the PK trial_results dedupes on.
      payload: {
        trials: Array.from({ length: 20 }, () => ({
          ...trial,
          id: randomUUID(),
        })),
      },
    });

    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      headers: { authorization: `Bearer ${anonToken}` },
      payload: { email: EMAIL, code: codeFor(db, EMAIL) },
    });
    expect(verifyRes.statusCode).toBe(200);
    const realToken = verifyRes.json().token as string;

    const realEmailHash = hashEmail(EMAIL, TEST_SECRET);
    expect(getTrialResultsForUser(db, realEmailHash)).toHaveLength(20);

    // The merged trials are what level-stats derives from, so the new
    // account sees the anonymous identity's completed level.
    const levelStatsRes = await app.inject({
      method: "GET",
      url: "/sync/level-stats",
      headers: { authorization: `Bearer ${realToken}` },
    });
    expect(levelStatsRes.json().levelStats["5"]).toMatchObject({ stars: 3 });

    // The old anonymous session is gone…
    const anonMeRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${anonToken}` },
    });
    expect(anonMeRes.statusCode).toBe(401);

    // …the new one works.
    const realMeRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${realToken}` },
    });
    expect(realMeRes.statusCode).toBe(200);
  });

  it("does not merge when the bearer token belongs to a different real account, not an anonymous one", async () => {
    const { db, app } = setup();
    const emailA = "userA@example.com";

    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: emailA },
    });
    const verifyA = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email: emailA, code: codeFor(db, emailA) },
    });
    const tokenA = verifyA.json().token as string;

    await app.inject({
      method: "POST",
      url: "/sync/results",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { trials: [trial] },
    });

    // A second login (a different email) arrives carrying A's still-valid
    // token — e.g. a shared/kiosk browser that never logged A out.
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { email: EMAIL },
    });
    await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: EMAIL, code: codeFor(db, EMAIL) },
    });

    // B must not inherit A's data…
    expect(
      getTrialResultsForUser(db, hashEmail(EMAIL, TEST_SECRET)),
    ).toHaveLength(0);

    // …and A's own session and data must be completely untouched.
    const meResA = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(meResA.statusCode).toBe(200);
    expect(
      getTrialResultsForUser(db, hashEmail(emailA, TEST_SECRET)),
    ).toHaveLength(1);
  });
});
