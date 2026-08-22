import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  checkSession: vi.fn(),
  logoutRequest: vi.fn(),
}));

vi.mock("../storage/session", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("../sync/pull", () => ({
  pullLevelStats: vi.fn(),
}));

vi.mock("../storage/levelStats", () => ({
  mergeRemoteLevelStats: vi.fn(),
}));

import { createAuthStore } from "./index";
import { requestOtp, verifyOtp, checkSession, logoutRequest } from "./api";
import { loadSession, saveSession, clearSession } from "../storage/session";
import { pullLevelStats } from "../sync/pull";
import { mergeRemoteLevelStats } from "../storage/levelStats";

describe("createAuthStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSession).mockReturnValue(null);
    vi.mocked(pullLevelStats).mockResolvedValue(null);
  });

  it("starts idle when there's no persisted session", () => {
    const store = createAuthStore();
    expect(store.getState().state).toEqual({ type: "idle" });
  });

  it("restores a loggedIn state from a persisted session", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    expect(store.getState().state).toEqual({ type: "loggedIn", token: "t1", email: "a@b.com" });
  });

  it("startLogin moves from idle to enteringEmail", () => {
    const store = createAuthStore();
    store.getState().startLogin();
    expect(store.getState().state).toEqual({ type: "enteringEmail", submitting: false, error: null });
  });

  it("startLogin is a no-op once already logged in", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    store.getState().startLogin();
    expect(store.getState().state).toEqual({ type: "loggedIn", token: "t1", email: "a@b.com" });
  });

  it("requestCode moves to enteringCode on success", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    const store = createAuthStore();
    store.getState().startLogin();

    await store.getState().requestCode("a@b.com");

    expect(store.getState().state).toEqual({
      type: "enteringCode",
      email: "a@b.com",
      submitting: false,
      error: null,
    });
  });

  it("requestCode surfaces an error and stays on enteringEmail", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: false, error: "rate_limited" });
    const store = createAuthStore();
    store.getState().startLogin();

    await store.getState().requestCode("a@b.com");

    expect(store.getState().state).toEqual({
      type: "enteringEmail",
      submitting: false,
      error: "rate_limited",
    });
  });

  it("verifyCode logs in and persists the session on success", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    vi.mocked(verifyOtp).mockResolvedValue({ ok: true, token: "tok" });
    const store = createAuthStore();
    store.getState().startLogin();
    await store.getState().requestCode("a@b.com");

    await store.getState().verifyCode("123456");

    expect(store.getState().state).toEqual({ type: "loggedIn", token: "tok", email: "a@b.com" });
    expect(saveSession).toHaveBeenCalledWith({ token: "tok", email: "a@b.com" });
  });

  it("requestCode does not resurrect the flow if cancelled while in flight", async () => {
    let resolveRequest!: (v: { ok: true }) => void;
    vi.mocked(requestOtp).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const store = createAuthStore();
    store.getState().startLogin();
    const pending = store.getState().requestCode("a@b.com");

    store.getState().cancel(); // user backs out while the request is in flight
    resolveRequest({ ok: true });
    await pending;

    expect(store.getState().state).toEqual({ type: "idle" });
  });

  it("verifyCode does not resurrect the flow if cancelled while in flight", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    let resolveVerify!: (v: { ok: true; token: string }) => void;
    vi.mocked(verifyOtp).mockReturnValue(
      new Promise((resolve) => {
        resolveVerify = resolve;
      }),
    );
    const store = createAuthStore();
    store.getState().startLogin();
    await store.getState().requestCode("a@b.com");
    const pending = store.getState().verifyCode("123456");

    store.getState().cancel();
    resolveVerify({ ok: true, token: "tok" });
    await pending;

    expect(store.getState().state).toEqual({ type: "idle" });
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("leaves levelStatsSyncedAt null when there's nothing to merge", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    vi.mocked(verifyOtp).mockResolvedValue({ ok: true, token: "tok" });
    // pullLevelStats defaults to resolving null per the top-level beforeEach
    const store = createAuthStore();
    store.getState().startLogin();
    await store.getState().requestCode("a@b.com");

    await store.getState().verifyCode("123456");
    await Promise.resolve();

    expect(mergeRemoteLevelStats).not.toHaveBeenCalled();
    expect(store.getState().levelStatsSyncedAt).toBeNull();
  });

  it("verifyCode pulls and merges remote LevelStats after logging in", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    vi.mocked(verifyOtp).mockResolvedValue({ ok: true, token: "tok" });
    vi.mocked(pullLevelStats).mockResolvedValue({ "1": { stars: 3, totalTime: 5000, completedAt: "x" } });
    const store = createAuthStore();
    store.getState().startLogin();
    await store.getState().requestCode("a@b.com");

    await store.getState().verifyCode("123456");
    await Promise.resolve(); // let the fire-and-forget sync settle

    expect(pullLevelStats).toHaveBeenCalledWith("tok");
    expect(mergeRemoteLevelStats).toHaveBeenCalledWith({
      "1": { stars: 3, totalTime: 5000, completedAt: "x" },
    });
    expect(store.getState().levelStatsSyncedAt).not.toBeNull();
  });

  it("verifyCode surfaces an error and stays on enteringCode", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ ok: true });
    vi.mocked(verifyOtp).mockResolvedValue({ ok: false, error: "invalid_code" });
    const store = createAuthStore();
    store.getState().startLogin();
    await store.getState().requestCode("a@b.com");

    await store.getState().verifyCode("000000");

    expect(store.getState().state).toEqual({
      type: "enteringCode",
      email: "a@b.com",
      submitting: false,
      error: "invalid_code",
    });
  });

  it("logout clears the persisted session and returns to idle", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(logoutRequest).mockResolvedValue(undefined);
    const store = createAuthStore();

    store.getState().logout();

    expect(store.getState().state).toEqual({ type: "idle" });
    expect(clearSession).toHaveBeenCalled();
    expect(logoutRequest).toHaveBeenCalledWith("t1");
  });

  it("cancel returns to idle from any in-progress step", () => {
    const store = createAuthStore();
    store.getState().startLogin();
    store.getState().cancel();
    expect(store.getState().state).toEqual({ type: "idle" });
  });

  it("restoreSession clears an invalid persisted session", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "stale", email: "a@b.com" });
    vi.mocked(checkSession).mockResolvedValue(false);
    const store = createAuthStore();
    expect(store.getState().state.type).toBe("loggedIn"); // optimistic, local-first

    await store.getState().restoreSession();

    expect(store.getState().state).toEqual({ type: "idle" });
    expect(clearSession).toHaveBeenCalled();
  });

  it("restoreSession keeps a valid persisted session logged in", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(checkSession).mockResolvedValue(true);
    const store = createAuthStore();

    await store.getState().restoreSession();

    expect(store.getState().state).toEqual({ type: "loggedIn", token: "t1", email: "a@b.com" });
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("restoreSession pulls and merges remote LevelStats for a valid session", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(checkSession).mockResolvedValue(true);
    vi.mocked(pullLevelStats).mockResolvedValue({ "2": { stars: 1, totalTime: 9000, completedAt: "y" } });
    const store = createAuthStore();

    await store.getState().restoreSession();
    await Promise.resolve();

    expect(pullLevelStats).toHaveBeenCalledWith("t1");
    expect(mergeRemoteLevelStats).toHaveBeenCalledWith({
      "2": { stars: 1, totalTime: 9000, completedAt: "y" },
    });
    expect(store.getState().levelStatsSyncedAt).not.toBeNull();
  });
});
