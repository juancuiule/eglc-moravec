import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { sync: vi.fn() } }));

// Keeps localStore/resetLocalStore real (this suite's whole point is testing
// against a real in-memory TinyBase store) but lets individual tests control
// when IndexedDB hydration "finishes".
vi.mock("../storage/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/store")>();
  return { ...actual, initLocalStorePersistence: vi.fn().mockResolvedValue(undefined) };
});

import { sync, resetCursor } from "./syncEngine";
import { Api } from "../api/Api";
import { resetLocalStore, localStore, initLocalStorePersistence } from "../storage/store";
import { appendTrials, type PersistedTrial } from "../storage/trialHistory";
import { appendPracticeTrials, type PersistedPracticeTrial } from "../storage/practiceHistory";
import type { AuthState } from "../auth/store";
import type { SyncResponse } from "../api/Api";

const loggedOut: AuthState = { type: "loggedOut" };
const loggedIn: AuthState = { type: "loggedIn", token: "tok123", email: "a@b.com" };

function emptyResponse(cursor = 0): SyncResponse {
  return { cursor, trials: [], levelRuns: [] };
}

function trial(overrides: Partial<PersistedTrial> = {}): PersistedTrial {
  return {
    id: "trial-1",
    levelNumber: 1,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId: "run-1",
    operands: [4, 5],
    answer: 9,
    ...overrides,
  };
}

function practiceTrial(overrides: Partial<PersistedPracticeTrial> = {}): PersistedPracticeTrial {
  return {
    id: "practice-trial-1",
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [],
    hintShown: false,
    runId: "practice-run-1",
    operands: [4, 5],
    answer: 9,
    ...overrides,
  };
}

beforeEach(() => {
  resetLocalStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sync", () => {
  it("no-ops entirely when logged out", async () => {
    appendTrials([trial()]);
    await sync(loggedOut);
    expect(Api.sync).not.toHaveBeenCalled();
  });

  it("waits for local-store persistence to finish loading before reading anything pending — a boot-time call must not race IndexedDB hydration", async () => {
    let resolveLoad!: () => void;
    vi.mocked(initLocalStorePersistence).mockReturnValueOnce(
      new Promise<void>((resolve) => { resolveLoad = resolve; }),
    );
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse());

    // Simulates a trial that was already on disk from a previous session,
    // "arriving" only once hydration completes — appended here before the
    // load resolves, standing in for data IndexedDB hasn't handed back yet.
    appendTrials([trial({ id: "pre-existing" })]);

    const syncPromise = sync(loggedIn);
    await Promise.resolve(); // let any pre-hydration microtasks run
    expect(Api.sync).not.toHaveBeenCalled();

    resolveLoad();
    await syncPromise;

    const [, request] = vi.mocked(Api.sync).mock.calls[0];
    expect(request.trials.map((t) => t.id)).toEqual(["pre-existing"]);
  });

  it("sends only synced:false trials in the push", async () => {
    appendTrials([trial({ id: "pending-1" })]);
    localStore.setRow("trials", "already-synced", {
      id: "already-synced",
      runType: "level",
      levelNumber: 1,
      categoryCodename: "1d+1d",
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: "2026-01-01T00:00:00.000Z",
      keystrokes: "[]",
      operands: "[]",
      hintShown: false,
      streakAtSubmit: 0,
      hintsAvailableAtStart: 3,
      runId: "run-2",
      synced: true,
    });
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse());

    await sync(loggedIn);

    const [, request] = vi.mocked(Api.sync).mock.calls[0];
    expect(request.trials.map((t) => t.id)).toEqual(["pending-1"]);
  });

  it("reconstructs a Practice trial's streakAtSubmit from the streak going INTO it, not including its own outcome", async () => {
    // Three Practice trials in the same run, in order: correct, correct, wrong.
    // streakAtSubmit means "the streak before this trial's own result" — see
    // game/index.ts:174 (currentStreak(state.results), computed before the
    // current trial is appended) and the deleted pushPracticeResults.ts's
    // currentStreak(results.slice(0, i)), which excludes index i.
    appendPracticeTrials([
      practiceTrial({ id: "p1", runId: "practice-run", correct: true, playedAt: "2026-01-01T00:00:01.000Z" }),
      practiceTrial({ id: "p2", runId: "practice-run", correct: true, playedAt: "2026-01-01T00:00:02.000Z" }),
      practiceTrial({ id: "p3", runId: "practice-run", correct: false, playedAt: "2026-01-01T00:00:03.000Z" }),
    ]);
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse());

    await sync(loggedIn);

    const [, request] = vi.mocked(Api.sync).mock.calls[0];
    const byId = Object.fromEntries(request.trials.map((t) => [t.id, t.streakAtSubmit]));
    expect(byId).toEqual({ p1: 0, p2: 1, p3: 2 });
  });

  it("sends the current cursor with the request", async () => {
    localStore.setValues({ cursor: 7 });
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse(7));

    await sync(loggedIn);

    const [, request] = vi.mocked(Api.sync).mock.calls[0];
    expect(request.cursor).toBe(7);
  });

  it("marks pushed trials as synced on success", async () => {
    appendTrials([trial({ id: "pending-1" })]);
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse());

    await sync(loggedIn);

    expect(localStore.getCell("trials", "pending-1", "synced")).toBe(true);
  });

  it("writes a pulled trial into the store via setRow", async () => {
    vi.mocked(Api.sync).mockResolvedValue({
      cursor: 3,
      trials: [
        {
          id: "remote-trial",
          runType: "level",
          levelNumber: 2,
          categoryCodename: "1dx1d",
          correct: true,
          timeExceeded: false,
          timeTaken: 900,
          playedAt: 1_700_000_000_000,
          hintShown: false,
          streakAtSubmit: 1,
          hintsAvailableAtStart: 3,
          runId: "remote-run",
        },
      ],
      levelRuns: [],
    });

    await sync(loggedIn);

    expect(localStore.getRow("trials", "remote-trial")).toMatchObject({
      categoryCodename: "1dx1d",
      correct: true,
      synced: true,
    });
  });

  it("unconditionally overwrites a level run with the server's values, even if a local one already exists under the same id", async () => {
    localStore.setRow("levelRuns", "run-1", {
      id: "run-1",
      levelNumber: 4,
      stars: 1,
      totalTime: 9999,
      levelCompleted: false,
      playedAt: "2026-01-01T00:00:00.000Z",
      synced: false,
    });
    vi.mocked(Api.sync).mockResolvedValue({
      cursor: 1,
      trials: [],
      levelRuns: [
        { id: "run-1", levelNumber: 4, stars: 3, totalTime: 5000, levelCompleted: true, playedAt: 1_700_000_000_000 },
      ],
    });

    await sync(loggedIn);

    expect(localStore.getRow("levelRuns", "run-1")).toMatchObject({ stars: 3, totalTime: 5000, synced: true });
  });

  it("stores the new cursor on success", async () => {
    vi.mocked(Api.sync).mockResolvedValue(emptyResponse(42));

    await sync(loggedIn);

    expect(localStore.getValue("cursor")).toBe(42);
  });

  it("changes nothing locally on failure", async () => {
    appendTrials([trial({ id: "pending-1" })]);
    localStore.setValues({ cursor: 5 });
    vi.mocked(Api.sync).mockRejectedValue(new Error("network down"));

    await sync(loggedIn);

    expect(localStore.getCell("trials", "pending-1", "synced")).toBe(false);
    expect(localStore.getValue("cursor")).toBe(5);
  });
});

describe("resetCursor", () => {
  it("sets the stored cursor back to 0", () => {
    localStore.setValues({ cursor: 201 });

    resetCursor();

    expect(localStore.getValue("cursor")).toBe(0);
  });

  it("is a no-op-safe call when there was no cursor stored yet", () => {
    resetCursor();
    expect(localStore.getValue("cursor")).toBe(0);
  });
});

describe("sync backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("schedules a retry after a failure, without another explicit sync() call", async () => {
    vi.mocked(Api.sync).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(emptyResponse());

    await sync(loggedIn);
    expect(Api.sync).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();

    expect(Api.sync).toHaveBeenCalledTimes(2);
  });

  it("increases the backoff delay on consecutive failures — doubles, not a fixed gap", async () => {
    vi.mocked(Api.sync).mockRejectedValue(new Error("down"));

    await sync(loggedIn); // attempt 1, fails, schedules retry in [1000, 1200)
    expect(Api.sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1200);
    expect(Api.sync).toHaveBeenCalledTimes(2); // attempt 2 fired, fails, schedules retry in [2000, 2400)

    await vi.advanceTimersByTimeAsync(1500); // well short of the doubled gap
    expect(Api.sync).toHaveBeenCalledTimes(2); // not yet — proves the gap grew, not stayed at ~1200

    await vi.advanceTimersByTimeAsync(1000); // total 2500 since attempt 2 — past the [2000, 2400) window
    expect(Api.sync).toHaveBeenCalledTimes(3);
  });

  it("resets backoff when sync() is called again externally", async () => {
    vi.mocked(Api.sync).mockRejectedValue(new Error("down"));
    await sync(loggedIn); // schedules a ~1-2s retry

    await sync(loggedIn); // fresh external trigger — cancels the pending retry, resets backoff, tries immediately
    expect(Api.sync).toHaveBeenCalledTimes(2);

    // If backoff had not reset, the next retry would be scheduled far out;
    // since it did reset, a short advance should trigger the next attempt.
    await vi.advanceTimersByTimeAsync(1500);
    expect(Api.sync).toHaveBeenCalledTimes(3);
  });
});
