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

vi.mock("../sync/syncEngine", () => ({ sync: vi.fn() }));
vi.mock("../storage/store", () => ({ resetLocalStore: vi.fn() }));

import { createAuthStore } from "./store";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession } from "../storage/session";
import { sync } from "../sync/syncEngine";
import { resetLocalStore } from "../storage/store";

describe("createAuthStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSession).mockReturnValue(null);
  });

  it("starts loggedOut before hydrate() runs, even with a persisted session", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    // Deliberately not read at store-creation time — see AuthStore.hydrate.
    expect(store.getState().state).toEqual({ type: "loggedOut" });
    expect(loadSession).not.toHaveBeenCalled();
  });

  it("hydrate() stays loggedOut when there's no persisted session", () => {
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state).toEqual({ type: "loggedOut" });
  });

  it("hydrate() restores a loggedIn state from a persisted session", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state).toEqual({ type: "loggedIn", token: "t1", email: "a@b.com" });
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
      expect(store.getState().state).toEqual({ type: "loggedOut" });
    });
  });

  it("login persists the session and moves to loggedIn", () => {
    const store = createAuthStore();

    store.getState().login({ token: "tok", email: "a@b.com" });

    expect(store.getState().state).toEqual({ type: "loggedIn", token: "tok", email: "a@b.com" });
    expect(saveSession).toHaveBeenCalledWith({ token: "tok", email: "a@b.com" });
  });

  it("logout clears the persisted session, calls Api.logout, and returns to loggedOut", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(sync).mockResolvedValue(undefined);
    const store = createAuthStore();
    store.getState().hydrate();

    await store.getState().logout();

    expect(store.getState().state).toEqual({ type: "loggedOut" });
    expect(clearSession).toHaveBeenCalled();
    expect(Api.logout).toHaveBeenCalledWith("t1");
  });

  it("logout is a no-op when already loggedOut", async () => {
    const store = createAuthStore();

    await store.getState().logout();

    expect(Api.logout).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("logout attempts a best-effort final flush under the old identity before clearing local data — on a shared browser, the next login must not inherit this user's still-pending trials", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(sync).mockResolvedValue(undefined);
    const store = createAuthStore();
    store.getState().hydrate();

    await store.getState().logout();

    expect(sync).toHaveBeenCalledWith({ type: "loggedIn", token: "t1", email: "a@b.com" });
    expect(resetLocalStore).toHaveBeenCalled();
    expect(vi.mocked(sync).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(resetLocalStore).mock.invocationCallOrder[0],
    );
  });

  it("still clears local data even when the final flush fails — the old data is accepted as lost, not left behind to leak into the next session", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    vi.mocked(sync).mockRejectedValue(new Error("offline"));
    const store = createAuthStore();
    store.getState().hydrate();

    await store.getState().logout();

    expect(resetLocalStore).toHaveBeenCalled();
    expect(store.getState().state).toEqual({ type: "loggedOut" });
  });
});
