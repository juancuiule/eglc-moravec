import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({
  Api: {
    checkSession: vi.fn(),
    logout: vi.fn(),
    registerDevice: vi.fn(),
  },
}));

vi.mock("../storage/session", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("../storage/deviceId", () => ({
  getOrCreateDeviceId: vi.fn(() => "device-1"),
}));

import { createAuthStore, authToken, setLogoutHook } from "./store";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession } from "../storage/session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("createAuthStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSession).mockReturnValue(null);
  });

  it("starts loggedOut before hydrate() runs, even with a persisted session", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    // Deliberately not read at store-creation time — see AuthStore.hydrate.
    expect(store.getState().state).toEqual({ type: "logged-out" });
    expect(loadSession).not.toHaveBeenCalled();
  });

  it("hydrate() stays loggedOut when there's no persisted session", () => {
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state).toEqual({ type: "logged-out" });
  });

  it("hydrate() restores a loggedIn state from a persisted session", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state).toEqual({
      type: "logged-in",
      token: "t1",
      email: "a@b.com",
    });
  });

  it("hydrate() never calls the backend — validation happens in proxy.ts, not here", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    store.getState().hydrate();
    expect(Api.checkSession).not.toHaveBeenCalled();
  });

  it("hydrate() restores an anonymous state from a persisted session with a null email", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: null });
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state).toEqual({ type: "anonymous", token: "t1" });
  });

  it("loginAnonymous persists a null-email session and moves to anonymous", () => {
    const store = createAuthStore();

    store.getState().loginAnonymous({ token: "anon-tok" });

    expect(store.getState().state).toEqual({
      type: "anonymous",
      token: "anon-tok",
    });
    expect(saveSession).toHaveBeenCalledWith({
      token: "anon-tok",
      email: null,
    });
  });

  describe("ensureSession", () => {
    it("mints and stores an anonymous session when starting loggedOut", async () => {
      vi.mocked(Api.registerDevice).mockResolvedValue({
        token: "anon-tok",
        expiresAt: 123,
      });
      const store = createAuthStore();

      await store.getState().ensureSession();

      expect(Api.registerDevice).toHaveBeenCalledWith("device-1");
      expect(store.getState().state).toEqual({
        type: "anonymous",
        token: "anon-tok",
      });
    });

    it("does not replace an OTP login when device registration resolves late", async () => {
      const registration = deferred<{ token: string; expiresAt: number }>();
      vi.mocked(Api.registerDevice).mockReturnValue(registration.promise);
      const store = createAuthStore();

      const ensureSession = store.getState().ensureSession();
      store
        .getState()
        .login({ token: "otp-token", email: "player@example.com" });
      registration.resolve({ token: "anonymous-token", expiresAt: 123 });
      await ensureSession;

      expect(store.getState().state).toEqual({
        type: "logged-in",
        token: "otp-token",
        email: "player@example.com",
      });
      expect(saveSession).toHaveBeenCalledTimes(1);
      expect(saveSession).toHaveBeenCalledWith({
        token: "otp-token",
        email: "player@example.com",
      });
    });

    it("does not replace an anonymous session established by a concurrent call", async () => {
      const firstRegistration = deferred<{
        token: string;
        expiresAt: number;
      }>();
      const secondRegistration = deferred<{
        token: string;
        expiresAt: number;
      }>();
      vi.mocked(Api.registerDevice)
        .mockReturnValueOnce(firstRegistration.promise)
        .mockReturnValueOnce(secondRegistration.promise);
      const store = createAuthStore();

      const firstEnsureSession = store.getState().ensureSession();
      const secondEnsureSession = store.getState().ensureSession();
      secondRegistration.resolve({ token: "second-token", expiresAt: 123 });
      await secondEnsureSession;
      firstRegistration.resolve({ token: "first-token", expiresAt: 123 });
      await firstEnsureSession;

      expect(store.getState().state).toEqual({
        type: "anonymous",
        token: "second-token",
      });
      expect(saveSession).toHaveBeenCalledTimes(1);
      expect(saveSession).toHaveBeenCalledWith({
        token: "second-token",
        email: null,
      });
    });

    it("is a no-op when already anonymous", async () => {
      vi.mocked(loadSession).mockReturnValue({ token: "t1", email: null });
      const store = createAuthStore();
      store.getState().hydrate();

      await store.getState().ensureSession();

      expect(Api.registerDevice).not.toHaveBeenCalled();
    });

    it("is a no-op when already loggedIn", async () => {
      vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
      const store = createAuthStore();
      store.getState().hydrate();

      await store.getState().ensureSession();

      expect(Api.registerDevice).not.toHaveBeenCalled();
    });

    it("leaves state loggedOut when the request fails, without throwing", async () => {
      vi.mocked(Api.registerDevice).mockRejectedValue(
        new Error("network down"),
      );
      const store = createAuthStore();

      await expect(store.getState().ensureSession()).resolves.toBeUndefined();
      expect(store.getState().state).toEqual({ type: "logged-out" });
    });
  });

  it("login persists the session and moves to loggedIn", () => {
    const store = createAuthStore();

    store.getState().login({ token: "tok", email: "a@b.com" });

    expect(store.getState().state).toEqual({
      type: "logged-in",
      token: "tok",
      email: "a@b.com",
    });
    expect(saveSession).toHaveBeenCalledWith({
      token: "tok",
      email: "a@b.com",
    });
  });

  it("logout clears the persisted session immediately, then establishes a fresh anonymous session", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(Api.registerDevice).mockResolvedValue({
      token: "fresh-anon-token",
      expiresAt: 123,
    });
    const store = createAuthStore();
    store.getState().hydrate();

    store.getState().logout();

    expect(store.getState().state).toEqual({ type: "logged-out" });
    expect(clearSession).toHaveBeenCalled();
    // Server-side revocation is deferred behind the outbox flush hook.
    await vi.waitFor(() => expect(Api.logout).toHaveBeenCalledWith("t1"));

    await vi.waitFor(() => {
      expect(store.getState().state).toEqual({
        type: "anonymous",
        token: "fresh-anon-token",
      });
    });
  });

  it("does not overwrite an OTP login when post-logout registration resolves late", async () => {
    const registration = deferred<{ token: string; expiresAt: number }>();
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(Api.registerDevice).mockReturnValue(registration.promise);
    const store = createAuthStore();
    store.getState().hydrate();

    store.getState().logout();
    store.getState().login({ token: "otp-token", email: "player@example.com" });
    registration.resolve({ token: "anonymous-token", expiresAt: 123 });
    await registration.promise;
    await vi.waitFor(() => expect(Api.registerDevice).toHaveBeenCalledTimes(1));

    expect(store.getState().state).toEqual({
      type: "logged-in",
      token: "otp-token",
      email: "player@example.com",
    });
    expect(saveSession).toHaveBeenLastCalledWith({
      token: "otp-token",
      email: "player@example.com",
    });
  });

  it("logout revokes the token only after the outbox hook settles — never concurrently", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(Api.registerDevice).mockResolvedValue({
      token: "fresh-anon-token",
      expiresAt: 123,
    });
    const flush = deferred<void>();
    setLogoutHook(() => flush.promise);
    const store = createAuthStore();
    store.getState().hydrate();

    store.getState().logout();
    // Logged out locally at once, but the revoke must wait on the flush —
    // otherwise it can land first and 401 the pending push.
    expect(store.getState().state).toEqual({ type: "logged-out" });
    await Promise.resolve();
    expect(Api.logout).not.toHaveBeenCalled();

    flush.resolve();
    await vi.waitFor(() => expect(Api.logout).toHaveBeenCalledWith("t1"));
    setLogoutHook(null);
  });

  it("logout is a no-op when already loggedOut", () => {
    const store = createAuthStore();

    store.getState().logout();

    expect(Api.logout).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });
});

describe("authToken", () => {
  it("is null when logged out", () => {
    expect(authToken({ type: "logged-out" })).toBeNull();
  });

  it("is the session token when anonymous", () => {
    expect(authToken({ type: "anonymous", token: "t1" })).toBe("t1");
  });

  it("is the session token when logged in", () => {
    expect(
      authToken({ type: "logged-in", token: "t1", email: "a@b.com" }),
    ).toBe("t1");
  });
});
