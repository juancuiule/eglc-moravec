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

import { createAuthStore, authToken } from "./store";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession } from "../storage/session";

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
    expect(store.getState().state).toEqual({ type: "logged-in", token: "t1", email: "a@b.com" });
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

    expect(store.getState().state).toEqual({ type: "anonymous", token: "anon-tok" });
    expect(saveSession).toHaveBeenCalledWith({ token: "anon-tok", email: null });
  });

  describe("ensureSession", () => {
    it("mints and stores an anonymous session when starting loggedOut", async () => {
      vi.mocked(Api.registerDevice).mockResolvedValue({ token: "anon-tok", expiresAt: 123 });
      const store = createAuthStore();

      await store.getState().ensureSession();

      expect(Api.registerDevice).toHaveBeenCalledWith("device-1");
      expect(store.getState().state).toEqual({ type: "anonymous", token: "anon-tok" });
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
      vi.mocked(Api.registerDevice).mockRejectedValue(new Error("network down"));
      const store = createAuthStore();

      await expect(store.getState().ensureSession()).resolves.toBeUndefined();
      expect(store.getState().state).toEqual({ type: "logged-out" });
    });
  });

  it("login persists the session and moves to loggedIn", () => {
    const store = createAuthStore();

    store.getState().login({ token: "tok", email: "a@b.com" });

    expect(store.getState().state).toEqual({ type: "logged-in", token: "tok", email: "a@b.com" });
    expect(saveSession).toHaveBeenCalledWith({ token: "tok", email: "a@b.com" });
  });

  it("logout clears the persisted session, calls Api.logout, and returns to loggedOut", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    const store = createAuthStore();
    store.getState().hydrate();

    store.getState().logout();

    expect(store.getState().state).toEqual({ type: "logged-out" });
    expect(clearSession).toHaveBeenCalled();
    expect(Api.logout).toHaveBeenCalledWith("t1");
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
    expect(authToken({ type: "logged-in", token: "t1", email: "a@b.com" })).toBe("t1");
  });
});
