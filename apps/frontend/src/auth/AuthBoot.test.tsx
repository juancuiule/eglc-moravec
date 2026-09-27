import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hydrate = vi.fn();
const ensureSession = vi.fn<() => Promise<void>>();
let state: { type: "logged-out" } | { type: "anonymous"; token: string };

vi.mock("./store", () => ({
  authStore: {
    getState: vi.fn(() => ({ state, hydrate, ensureSession })),
  },
}));

// The local-first engine starts from AuthBoot too — its own suite covers it;
// here it's a no-op so the session-recovery assertions stay isolated.
vi.mock("../local/store", () => ({ ensureLocalPersistence: vi.fn() }));
vi.mock("../local/syncEngine", () => ({
  startSyncEngine: vi.fn(() => () => {}),
}));

import { AuthBoot } from "./AuthBoot";

describe("AuthBoot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state = { type: "logged-out" };
    ensureSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates, then recovers from a transient session mint failure on backoff", async () => {
    ensureSession
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        state = { type: "anonymous", token: "anon-token" };
      });

    render(<AuthBoot />);
    await act(async () => {});

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(ensureSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(ensureSession).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries promptly when the browser comes online", async () => {
    ensureSession
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        state = { type: "anonymous", token: "anon-token" };
      });

    render(<AuthBoot />);
    await act(async () => {});

    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => {});

    expect(ensureSession).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds retries and cleans up timers and the online listener", async () => {
    const { unmount } = render(<AuthBoot />);
    await act(async () => {});

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(ensureSession).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);

    unmount();
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => {});

    expect(ensureSession).toHaveBeenCalledTimes(4);
  });
});
