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

const PUSHED_TRIAL = {
  id: "trial-1",
  levelNumber: 1,
  categoryCodename: "1d+1d",
  correct: true,
  timeExceeded: false,
  clientCorrect: true,
  clientTimeExceeded: false,
  timeTaken: 1200,
  playedAt: Date.now(),
  keystrokes: [],
  hintShown: false,
  streakAtSubmit: 0,
  hintsAvailableAtStart: 3,
  levelRunId: "run-abc",
  operands: [2, 3],
  answer: 5,
};

test("pushTrialResults resolves with the backend's authoritative trials on success", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ trials: [PUSHED_TRIAL] }));
  await expect(Api.pushTrialResults("tok", [PUSHED_TRIAL])).resolves.toEqual([PUSHED_TRIAL]);
});

test("pushTrialResults throws on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "unauthenticated" }, false));
  await expect(Api.pushTrialResults("tok", [])).rejects.toThrow("unauthenticated");
});

test("pullLevelStats converts the backend's flat array into a keyed map", async () => {
  const levelStats = [{ levelNumber: 1, stars: 3, totalTime: 1000, completedAt: 1_735_689_600_000 }];
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ levelStats }));
  await expect(Api.pullLevelStats("tok")).resolves.toEqual({
    "1": { stars: 3, totalTime: 1000, completedAt: new Date(1_735_689_600_000).toISOString() },
  });
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

test("fetchLevelNumbers resolves with the level list", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ levels: [1, 2, 3] }));
  await expect(Api.fetchLevelNumbers()).resolves.toEqual([1, 2, 3]);
});

test("fetchLevel resolves with the mix for a known level", async () => {
  const mix = { "1d+1d": 50, "1dx1d": 50 };
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ levelNumber: 1, mix }));
  await expect(Api.fetchLevel(1)).resolves.toEqual(mix);
});

test("fetchLevel resolves with null for a 404, without throwing", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "not_found" }, false, 404));
  await expect(Api.fetchLevel(99999)).resolves.toBeNull();
});

test("fetchLevel throws on a non-404 failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "request_failed" }, false, 500));
  await expect(Api.fetchLevel(1)).rejects.toThrow("request_failed");
});
