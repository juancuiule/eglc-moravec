import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Api } from "./Api";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("requestOtp resolves on a successful request", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));
  await expect(Api.requestOtp("player@example.com")).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/auth/otp/request"),
    expect.objectContaining({ method: "POST" }),
  );
});

test("requestOtp throws the backend's error on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "rate_limited" }, false));
  await expect(Api.requestOtp("player@example.com")).rejects.toThrow("rate_limited");
});

test("verifyOtp resolves with the session token on success", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ token: "tok", expiresAt: 123 }));
  await expect(Api.verifyOtp("player@example.com", "123456")).resolves.toEqual({
    token: "tok",
    expiresAt: 123,
  });
});

test("verifyOtp throws on an invalid code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "invalid_code" }, false));
  await expect(Api.verifyOtp("player@example.com", "000000")).rejects.toThrow("invalid_code");
});

test("verifyOtp attaches an anonymous token as this request's own Bearer header, when given one", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ token: "tok", expiresAt: 123 }));
  await Api.verifyOtp("player@example.com", "123456", "anon-tok");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/auth/otp/verify"),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer anon-tok" }) }),
  );
});

test("verifyOtp sends no Authorization header without an anonymous token", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ token: "tok", expiresAt: 123 }));
  await Api.verifyOtp("player@example.com", "123456");
  const [, options] = vi.mocked(fetch).mock.calls[0];
  expect((options?.headers as Record<string, string>).Authorization).toBeUndefined();
});

test("registerDevice resolves with a session token", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ token: "tok", expiresAt: 123 }));
  await expect(Api.registerDevice("device-1")).resolves.toEqual({ token: "tok", expiresAt: 123 });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/auth/device"),
    expect.objectContaining({ method: "POST", body: JSON.stringify({ deviceId: "device-1" }) }),
  );
});

test("registerDevice throws the backend's error on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "invalid_request" }, false));
  await expect(Api.registerDevice("")).rejects.toThrow("invalid_request");
});

test("checkSession resolves true when the session is valid", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));
  await expect(Api.checkSession("tok")).resolves.toBe(true);
});

test("checkSession resolves false when the session is invalid", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "unauthenticated" }, false));
  await expect(Api.checkSession("tok")).resolves.toBe(false);
});

test("logout resolves on success", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));
  await expect(Api.logout("tok")).resolves.toBeUndefined();
});

test("logout throws on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "request_failed" }, false));
  await expect(Api.logout("tok")).rejects.toThrow();
});

test("syncResults resolves on success", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, stored: 1 }));
  await expect(
    Api.syncResults("tok", [
      {
        levelNumber: 1,
        categoryCodename: "1d+1d",
        correct: true,
        timeExceeded: false,
        timeTaken: 1200,
        playedAt: Date.now(),
        keystrokes: [],
        hintShown: false,
        streakAtSubmit: 0,
        hintsAvailableAtStart: 3,
        levelRunId: "run-abc",
        operands: [2, 3],
        answer: 5,
      },
    ]),
  ).resolves.toBeUndefined();
});

test("syncResults throws on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "unauthenticated" }, false));
  await expect(Api.syncResults("tok", [])).rejects.toThrow("unauthenticated");
});

test("pullLevelStats resolves with the remote LevelStats map on success", async () => {
  const levelStats = { "1": { stars: 3, totalTime: 1000, completedAt: "2026-01-01T00:00:00.000Z" } };
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ levelStats }));
  await expect(Api.pullLevelStats("tok")).resolves.toEqual(levelStats);
});

test("pullLevelStats throws on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "unauthenticated" }, false));
  await expect(Api.pullLevelStats("tok")).rejects.toThrow("unauthenticated");
});

test("fetchAdminStats resolves with byLevel/byCategory on success", async () => {
  const stats = { byLevel: [], byCategory: [] };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(stats));
  await expect(Api.fetchAdminStats()).resolves.toEqual(stats);
});

test("fetchAdminStats throws on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "request_failed" }, false));
  await expect(Api.fetchAdminStats()).rejects.toThrow();
});
