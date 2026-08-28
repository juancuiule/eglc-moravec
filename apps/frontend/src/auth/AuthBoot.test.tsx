import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const hydrate = vi.fn();
const ensureSession = vi.fn();
let currentState: { type: string; token?: string; email?: string } = { type: "loggedOut" };

vi.mock("./store", () => ({
  authStore: { getState: vi.fn(() => ({ hydrate, ensureSession, state: currentState })) },
}));

vi.mock("../sync/syncEngine", () => ({ sync: vi.fn() }));
vi.mock("../storage/levelCache", () => ({ warmLevelCache: vi.fn() }));

import { AuthBoot } from "./AuthBoot";
import { sync } from "../sync/syncEngine";
import { warmLevelCache } from "../storage/levelCache";

beforeEach(() => {
  vi.clearAllMocks();
  currentState = { type: "anonymous", token: "anon-tok" };
  ensureSession.mockResolvedValue(undefined);
  vi.mocked(warmLevelCache).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

test("hydrates from the session cookie, then ensures a session exists, once on mount", () => {
  render(<AuthBoot />);
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(ensureSession).toHaveBeenCalledTimes(1);
});

test("syncs once with the current authState after ensureSession resolves on mount", async () => {
  render(<AuthBoot />);
  await vi.waitFor(() => expect(sync).toHaveBeenCalledWith(currentState));
});

test("warms the level cache once on mount, independent of auth state", () => {
  currentState = { type: "loggedOut" };
  render(<AuthBoot />);
  expect(warmLevelCache).toHaveBeenCalledTimes(1);
});

test("registers a window 'online' listener on mount and removes it on unmount", () => {
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");

  const { unmount } = render(<AuthBoot />);
  expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));

  unmount();
  expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
});

test("on 'online', retries ensureSession first when still loggedOut, then syncs with the resulting authState", async () => {
  currentState = { type: "loggedOut" };
  render(<AuthBoot />);
  await vi.waitFor(() => expect(ensureSession).toHaveBeenCalledTimes(1)); // the mount-time attempt

  vi.mocked(ensureSession).mockClear();
  vi.mocked(sync).mockClear();
  ensureSession.mockImplementation(async () => {
    currentState = { type: "anonymous", token: "anon-tok" }; // as the real store would after a successful mint
  });

  window.dispatchEvent(new Event("online"));

  await vi.waitFor(() => expect(sync).toHaveBeenCalledWith({ type: "anonymous", token: "anon-tok" }));
  expect(ensureSession).toHaveBeenCalledTimes(1);
});

test("on 'online', does not retry ensureSession when already anonymous or logged in — just syncs", async () => {
  currentState = { type: "loggedIn", token: "tok123", email: "a@b.com" };
  render(<AuthBoot />);
  await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1)); // the mount-time sync

  vi.mocked(ensureSession).mockClear();
  vi.mocked(sync).mockClear();

  window.dispatchEvent(new Event("online"));

  await vi.waitFor(() => expect(sync).toHaveBeenCalledWith(currentState));
  expect(ensureSession).not.toHaveBeenCalled();
});
