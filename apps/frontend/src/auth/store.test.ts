import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({
  Api: {
    checkSession: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("../storage/session", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

import { createAuthStore } from "./store";
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

  it("login persists the session and moves to loggedIn", () => {
    const store = createAuthStore();

    store.getState().login({ token: "tok", email: "a@b.com" });

    expect(store.getState().state).toEqual({ type: "loggedIn", token: "tok", email: "a@b.com" });
    expect(saveSession).toHaveBeenCalledWith({ token: "tok", email: "a@b.com" });
  });

  it("logout clears the persisted session, calls Api.logout, and returns to loggedOut", () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.logout).mockResolvedValue(undefined);
    const store = createAuthStore();
    store.getState().hydrate();

    store.getState().logout();

    expect(store.getState().state).toEqual({ type: "loggedOut" });
    expect(clearSession).toHaveBeenCalled();
    expect(Api.logout).toHaveBeenCalledWith("t1");
  });

  it("logout is a no-op when already loggedOut", () => {
    const store = createAuthStore();

    store.getState().logout();

    expect(Api.logout).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("restoreSession is a no-op when loggedOut", async () => {
    const store = createAuthStore();

    await store.getState().restoreSession();

    expect(Api.checkSession).not.toHaveBeenCalled();
  });

  it("restoreSession clears an invalid persisted session", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "stale", email: "a@b.com" });
    vi.mocked(Api.checkSession).mockResolvedValue(false);
    const store = createAuthStore();
    store.getState().hydrate();
    expect(store.getState().state.type).toBe("loggedIn"); // optimistic, local-first

    await store.getState().restoreSession();

    expect(store.getState().state).toEqual({ type: "loggedOut" });
    expect(clearSession).toHaveBeenCalled();
  });

  it("restoreSession keeps a valid persisted session logged in", async () => {
    vi.mocked(loadSession).mockReturnValue({ token: "t1", email: "a@b.com" });
    vi.mocked(Api.checkSession).mockResolvedValue(true);
    const store = createAuthStore();
    store.getState().hydrate();

    await store.getState().restoreSession();

    expect(store.getState().state).toEqual({ type: "loggedIn", token: "t1", email: "a@b.com" });
    expect(clearSession).not.toHaveBeenCalled();
  });
});
