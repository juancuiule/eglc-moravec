import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { openDb } from "../db.js";
import { sendOtpEmail } from "../auth/email.js";
import { hashEmail } from "../auth/logic.js";
import { getOtpRow, incrementOtpAttempts } from "../auth/repo.js";

vi.mock("../auth/email.js", () => ({ sendOtpEmail: vi.fn() }));

const SECRET = "rate-limit-test-secret";
const NGINX_IP = "172.30.60.2";
let now: number;
const resources: { app: FastifyInstance; db: DatabaseSync }[] = [];

beforeEach(() => {
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.mocked(sendOtpEmail).mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  for (const { app, db } of resources.splice(0)) {
    await app.close();
    db.close();
  }
  vi.restoreAllMocks();
});

function setup(env: NodeJS.ProcessEnv = {}) {
  const db = openDb(":memory:");
  const app = buildApp(db, loadConfig({ HASH_SECRET: SECRET, ...env }));
  resources.push({ app, db });
  let sequence = 0;
  return {
    app,
    db,
    request: (
      email = `player${sequence++}@example.com`,
      remoteAddress = "192.0.2.1",
      headers: Record<string, string> = {},
    ) =>
      app.inject({
        method: "POST",
        url: "/auth/otp/request",
        payload: { email },
        remoteAddress,
        headers,
      }),
  };
}

function expectLimited(
  res: LightMyRequestResponse,
  max: number,
  seconds: number,
) {
  expect(res.statusCode).toBe(429);
  expect(res.json()).toEqual({ error: "rate_limited" });
  expect(res.headers["retry-after"]).toBe(String(seconds));
  expect(res.headers["x-ratelimit-limit"]).toBe(String(max));
  expect(res.headers["x-ratelimit-remaining"]).toBe("0");
  expect(res.headers["x-ratelimit-reset"]).toBe(String(seconds));
}

describe("OTP per-IP rate limit", () => {
  it("allows ten requests, rejects eleven without OTP mutation, and expires without extending on denial", async () => {
    const { request, db } = setup();
    for (let i = 0; i < 10; i++) expect((await request()).statusCode).toBe(200);
    expectLimited(await request("blocked@example.com"), 10, 600);
    expect(
      getOtpRow(db, hashEmail("blocked@example.com", SECRET)),
    ).toBeUndefined();
    expect(sendOtpEmail).toHaveBeenCalledTimes(10);
    now += 599_001;
    expectLimited(await request(), 10, 1);
    now += 999;
    expect((await request()).statusCode).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(11);
  });

  it("counts invalid JSON, invalid bodies and cooldown failures before any send", async () => {
    const { app, request } = setup({
      OTP_IP_RATE_LIMIT_MAX: "4",
      OTP_GLOBAL_RATE_LIMIT_MAX: "2",
    });
    const malformed = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      remoteAddress: "192.0.2.1",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(malformed.statusCode).toBe(400);
    expect((await request("not-an-email")).statusCode).toBe(400);
    expect((await request("same@example.com")).statusCode).toBe(200);
    expectLimited(await request("same@example.com"), 1, 30);
    expectLimited(await request(), 4, 600);
    expect((await request(undefined, "192.0.2.2")).statusCode).toBe(200);
    expectLimited(await request(undefined, "192.0.2.3"), 2, 3600);
    expect(sendOtpEmail).toHaveBeenCalledTimes(2);
  });

  it("uses distinct forwarded IPs only from the configured nginx peer", async () => {
    const { request } = setup({
      TRUSTED_PROXY_IP: NGINX_IP,
      OTP_IP_RATE_LIMIT_MAX: "1",
    });
    expect(
      (await request(undefined, NGINX_IP, { "x-forwarded-for": "203.0.113.1" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(undefined, NGINX_IP, { "x-forwarded-for": "203.0.113.2" }))
        .statusCode,
    ).toBe(200);
    expectLimited(
      await request(undefined, NGINX_IP, { "x-forwarded-for": "203.0.113.1" }),
      1,
      600,
    );
  });

  it.each([undefined, NGINX_IP])(
    "ignores spoofed XFF and CF headers from a direct peer (trust %s)",
    async (trusted) => {
      const { request } = setup({
        TRUSTED_PROXY_IP: trusted,
        OTP_IP_RATE_LIMIT_MAX: "1",
      });
      for (let i = 1; i <= 2; i++) {
        const response = await request(undefined, "192.0.2.1", {
          "x-forwarded-for": `203.0.113.${i}`,
          "cf-connecting-ip": `203.0.113.${i}`,
          "x-real-ip": `203.0.113.${i}`,
        });
        if (i === 1) expect(response.statusCode).toBe(200);
        else expectLimited(response, 1, 600);
      }
    },
  );

  it("does not trust adjacent peers or CF headers directly, even with proxy trust enabled", async () => {
    const { request } = setup({
      TRUSTED_PROXY_IP: NGINX_IP,
      OTP_IP_RATE_LIMIT_MAX: "1",
    });
    for (const peer of [NGINX_IP, "172.30.60.3"]) {
      expect(
        (await request(undefined, peer, { "cf-connecting-ip": "203.0.113.1" }))
          .statusCode,
      ).toBe(200);
      expectLimited(
        await request(undefined, peer, { "cf-connecting-ip": "203.0.113.2" }),
        1,
        600,
      );
    }
  });

  it("recognizes IPv4-mapped nginx socket addresses without broadening trust", async () => {
    const { request } = setup({
      TRUSTED_PROXY_IP: NGINX_IP,
      OTP_IP_RATE_LIMIT_MAX: "1",
    });
    expect(
      (
        await request(undefined, `::ffff:${NGINX_IP}`, {
          "x-forwarded-for": "203.0.113.1",
        })
      ).statusCode,
    ).toBe(200);
    expectLimited(
      await request(undefined, NGINX_IP, { "x-forwarded-for": "203.0.113.1" }),
      1,
      600,
    );
    expect(
      (await request(undefined, NGINX_IP, { "x-forwarded-for": "203.0.113.2" }))
        .statusCode,
    ).toBe(200);
  });

  it("trusts only one nginx hop, not a caller-controlled prefix or CF header", async () => {
    const { request } = setup({
      TRUSTED_PROXY_IP: NGINX_IP,
      OTP_IP_RATE_LIMIT_MAX: "1",
    });
    expect(
      (
        await request(undefined, NGINX_IP, {
          "x-forwarded-for": `203.0.113.1, ${NGINX_IP}`,
        })
      ).statusCode,
    ).toBe(200);
    expectLimited(
      await request(undefined, NGINX_IP, {
        "x-forwarded-for": `203.0.113.2, ${NGINX_IP}`,
        "cf-connecting-ip": "203.0.113.3",
      }),
      1,
      600,
    );
  });

  it("groups IPv6 representations and host addresses by /64 but not adjacent subnets", async () => {
    const { request } = setup({ OTP_IP_RATE_LIMIT_MAX: "1" });
    expect((await request(undefined, "2001:db8:abcd:1234::1")).statusCode).toBe(
      200,
    );
    expectLimited(
      await request(undefined, "2001:0db8:abcd:1234:ffff:ffff:ffff:ffff"),
      1,
      600,
    );
    expect((await request(undefined, "2001:db8:abcd:1235::1")).statusCode).toBe(
      200,
    );
  });

  it("shares IPv4 and mapped IPv6 buckets", async () => {
    const { request } = setup({ OTP_IP_RATE_LIMIT_MAX: "1" });
    expect((await request(undefined, "192.0.2.1")).statusCode).toBe(200);
    expectLimited(await request(undefined, "::ffff:192.0.2.1"), 1, 600);
  });

  it("does not limit other auth or health routes", async () => {
    const { app, request } = setup({ OTP_IP_RATE_LIMIT_MAX: "1" });
    await request();
    expectLimited(await request(), 1, 600);
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/otp/verify",
          payload: { email: "never-requested@example.com", code: "000000" },
        })
      ).statusCode,
    ).toBe(401);
  });
});

it("keeps personal data, auth values and raw provider errors out of request logs", async () => {
  const { app } = setup({ OTP_IP_RATE_LIMIT_MAX: "2" });
  const info = vi.spyOn(app.log, "info").mockImplementation(() => {});
  const error = vi.spyOn(app.log, "error").mockImplementation(() => {});
  const email = "private@example.com";
  const emailHash = hashEmail(email, SECRET);
  vi.mocked(sendOtpEmail).mockRejectedValue(
    new Error(`${email} ${emailHash} 123456 192.0.2.99 secret-token`),
  );
  const options = {
    method: "POST" as const,
    url: `/auth/otp/request?email=${email}&code=123456`,
    remoteAddress: "192.0.2.99",
    headers: {
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    },
  };
  expect(
    (await app.inject({ ...options, payload: `{"email":"${email}"` }))
      .statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ ...options, payload: { email } })).statusCode,
  ).toBe(502);
  expect(
    (await app.inject({ ...options, payload: { email } })).statusCode,
  ).toBe(429);
  expect(error).toHaveBeenCalledWith("OTP email delivery failed");
  const logs = JSON.stringify([info.mock.calls, error.mock.calls]);
  for (const sensitive of [
    email,
    emailHash,
    "123456",
    "192.0.2.99",
    "secret-token",
  ])
    expect(logs).not.toContain(sensitive);
});

describe("OTP global send-attempt limit", () => {
  it("honors custom windows and rounds Retry-After up to whole seconds", async () => {
    const { request } = setup({
      OTP_IP_RATE_LIMIT_MAX: "1",
      OTP_IP_RATE_LIMIT_WINDOW_MS: "1500",
      OTP_GLOBAL_RATE_LIMIT_MAX: "1",
      OTP_GLOBAL_RATE_LIMIT_WINDOW_MS: "2500",
    });
    expect((await request()).statusCode).toBe(200);
    expectLimited(await request(), 1, 2);
    now += 1500;
    expectLimited(await request(), 1, 1);
    now += 999;
    expectLimited(await request(undefined, "192.0.2.2"), 1, 1);
    now += 1;
    expect((await request(undefined, "192.0.2.3")).statusCode).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(2);
  });

  it("allows 100 sends across clients and rejects the next until one hour expires", async () => {
    const { request } = setup();
    for (let i = 0; i < 100; i++)
      expect((await request(undefined, `192.0.2.${i + 1}`)).statusCode).toBe(
        200,
      );
    expectLimited(await request(undefined, "198.51.100.1"), 100, 3600);
    now += 3_599_001;
    expectLimited(await request(undefined, "198.51.100.1"), 100, 1);
    now += 999;
    expect((await request(undefined, "198.51.100.1")).statusCode).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(101);
  });

  it("restores both an absent reservation and an exact prior row on global rejection", async () => {
    const { request, db } = setup({ OTP_GLOBAL_RATE_LIMIT_MAX: "1" });
    await request("existing@example.com");
    const emailHash = hashEmail("existing@example.com", SECRET);
    incrementOtpAttempts(db, emailHash);
    const before = getOtpRow(db, emailHash);
    now += 30_000;
    expectLimited(await request("existing@example.com"), 1, 3570);
    expect(getOtpRow(db, emailHash)).toEqual(before);
    expectLimited(await request("new@example.com"), 1, 3570);
    expect(getOtpRow(db, hashEmail("new@example.com", SECRET))).toBeUndefined();
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    now += 3_570_000;
    expect((await request("new@example.com")).statusCode).toBe(200);
  });

  it("counts provider failure globally while restoring the OTP row", async () => {
    const { request, db } = setup({ OTP_GLOBAL_RATE_LIMIT_MAX: "1" });
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("provider failed"));
    expect((await request("failed@example.com")).statusCode).toBe(502);
    expect(
      getOtpRow(db, hashEmail("failed@example.com", SECRET)),
    ).toBeUndefined();
    expectLimited(await request("failed@example.com"), 1, 3600);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
  });

  it("reserves global capacity atomically before awaiting concurrent deliveries", async () => {
    const { request, db } = setup({ OTP_GLOBAL_RATE_LIMIT_MAX: "2" });
    let release!: () => void;
    const holdDelivery = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    vi.mocked(sendOtpEmail)
      .mockImplementationOnce(holdDelivery)
      .mockImplementationOnce(holdDelivery);
    const first = request("first@example.com");
    await vi.waitFor(() => expect(sendOtpEmail).toHaveBeenCalledTimes(1));
    const releaseFirst = release;
    const second = request("second@example.com");
    await vi.waitFor(() => expect(sendOtpEmail).toHaveBeenCalledTimes(2));
    try {
      expectLimited(await request("third@example.com"), 2, 3600);
      expect(
        getOtpRow(db, hashEmail("third@example.com", SECRET)),
      ).toBeUndefined();
    } finally {
      releaseFirst();
      release();
    }
    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(2);
  });

  it("returns cooldown headers that shrink and permits an exact-boundary retry", async () => {
    const { request } = setup();
    await request("same@example.com");
    now += 29_001;
    expectLimited(await request("same@example.com"), 1, 1);
    now += 999;
    expect((await request("same@example.com")).statusCode).toBe(200);
  });
});
