import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Fakes ---------------------------------------------------------------

const { api, auth, ensureSessionToken, invalidateSession } = vi.hoisted(() => {
  const api = {
    syncResults: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    fetchTrials: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const auth = {
    state: { type: "logged-out" } as
      | { type: "logged-out" }
      | { type: "anonymous"; token: string }
      | { type: "logged-in"; token: string; email: string },
    subscribers: new Set<(s: never, p: never) => void>(),
    logoutHook: undefined as undefined | ((token: string) => Promise<void>),
  };
  const ensureSessionToken = vi.fn<() => Promise<string | null>>();
  const invalidateSession = vi.fn(() => {
    auth.state = { type: "logged-out" };
  });
  return { api, auth, ensureSessionToken, invalidateSession };
});

vi.mock("../api/Api", () => ({ Api: api }));
vi.mock("../auth/store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../auth/store")>();
  return {
    ...mod,
    authStore: {
      getState: () => ({
        state: auth.state,
        ensureSessionToken,
        invalidateSession,
      }),
      subscribe: (fn: (s: never, p: never) => void) => {
        auth.subscribers.add(fn);
        return () => auth.subscribers.delete(fn);
      },
    },
    setLogoutHook: vi.fn((h) => {
      auth.logoutHook = h;
    }),
  };
});

import { ApiError } from "../api/utils";
import { localStore, TRIALS_TABLE } from "./store";
import { enqueueRun, mergeServerTrials } from "./trials";
import { startSyncEngine, kickSync, flushSettled } from "./syncEngine";
import { Addition, type TrialResult, type TrialResultInput } from "engine";

function makeInput(id = crypto.randomUUID()): TrialResultInput {
  return {
    id,
    runId: crypto.randomUUID(),
    categoryCodename: "1dx1d",
    timeTaken: 800,
    playedAt: 1_700_000_000_000,
    operands: [6, 7],
    answer: 42,
    hintShown: false,
    runType: "level",
    levelNumber: 3,
  };
}

function makeResult(): TrialResult {
  const op = Addition.create({
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
  };
}

function setAuth(state: typeof auth.state) {
  const prev = auth.state;
  auth.state = state;
  auth.subscribers.forEach((fn) =>
    fn({ state } as never, { state: prev } as never),
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

let teardown: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  auth.subscribers.clear();
  auth.logoutHook = undefined;
  localStore.delTables();
  localStore.setValue("hydrated", true);
  setAuth({ type: "anonymous", token: "tok" });
  setOnline(true);
  api.syncResults.mockResolvedValue({});
  api.fetchTrials.mockResolvedValue([]);
  ensureSessionToken.mockResolvedValue("minted-tok");
});

afterEach(() => {
  teardown?.();
  teardown = undefined;
  vi.useRealTimers();
});

async function tick() {
  // Flush chains are promise-driven; a few microtask turns settle them.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("flush", () => {
  it("pushes pending rows, marks them synced, then pull-merges", async () => {
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();

    expect(api.syncResults).toHaveBeenCalledTimes(1);
    expect(api.syncResults).toHaveBeenCalledWith("tok", [
      expect.objectContaining({ id: input.id }),
    ]);
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
    expect(api.fetchTrials).toHaveBeenCalledWith("tok");
  });

  it("pull-merges even with an empty outbox — keeps multi-device honest", async () => {
    api.fetchTrials.mockResolvedValue([
      {
        id: "srv-9",
        runId: "r",
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 2,
        operands: [3, 4],
        answer: 12,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
      },
    ]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(api.syncResults).not.toHaveBeenCalled();
    expect(localStore.getRow(TRIALS_TABLE, "srv-9").synced).toBe(true);
  });

  it("leaves rows pending and schedules a retry when the push fails", async () => {
    api.syncResults.mockRejectedValue(new Error("boom"));
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(false);
    // A retry timer is armed; fake time shows it re-running.
    vi.useFakeTimers();
    api.syncResults.mockResolvedValue({});
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();
    await tick();
    expect(api.syncResults.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("the online event kicks a flush — connectivity is a hint, not a gate", async () => {
    // Boot with an empty outbox, then a push fails as "unreachable" — note
    // navigator.onLine is never consulted: real outcomes drive the loop.
    teardown = startSyncEngine();
    await tick();

    api.syncResults.mockRejectedValueOnce(new Error("unreachable"));
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    kickSync();
    await tick();
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(false);

    api.syncResults.mockResolvedValue({});
    window.dispatchEvent(new Event("online"));
    await tick();
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
  });

  it("establishes a session inside the flush when logged out", async () => {
    setAuth({ type: "logged-out" });
    enqueueRun([makeInput()], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    expect(ensureSessionToken).toHaveBeenCalled();
    expect(api.syncResults).toHaveBeenCalledWith(
      "minted-tok",
      expect.any(Array),
    );
  });

  it("401 → drops the dead session, re-mints anonymous, retries once", async () => {
    api.syncResults
      .mockRejectedValueOnce(new ApiError("unauthenticated", 401))
      .mockResolvedValueOnce({});
    ensureSessionToken.mockResolvedValue("re-minted");
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(invalidateSession).toHaveBeenCalledTimes(1);
    expect(api.syncResults).toHaveBeenCalledTimes(2);
    expect(api.syncResults).toHaveBeenLastCalledWith(
      "re-minted",
      expect.any(Array),
    );
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
  });

  it("401 on the retry too → stays pending, retry armed", async () => {
    api.syncResults.mockRejectedValue(new ApiError("unauthenticated", 401));
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    expect(api.syncResults.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(false);
  });

  it("coalesces kicks fired while a flush is in flight", async () => {
    let resolvePush: (v: unknown) => void = () => {};
    api.syncResults.mockImplementation(
      () => new Promise((res) => (resolvePush = res)),
    );
    enqueueRun([makeInput()], [makeResult()]);
    teardown = startSyncEngine();
    kickSync();
    kickSync();
    expect(api.syncResults).toHaveBeenCalledTimes(1);
    resolvePush({});
    await flushSettled();
    await tick();
    expect(api.fetchTrials).toHaveBeenCalled();
  });

  it("a 401 from a superseded token does NOT invalidate the current session", async () => {
    api.syncResults
      .mockImplementationOnce(async () => {
        // OTP login lands while the anonymous-token request is in flight —
        // the backend revokes the anon token, so the response is a 401 for
        // an identity that no longer exists.
        setAuth({ type: "logged-in", token: "acct", email: "a@b.com" });
        throw new ApiError("unauthenticated", 401);
      })
      .mockResolvedValue({});
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    // The logged-in session must survive — only the failed token may be
    // invalidated, and it already isn't current.
    expect(invalidateSession).not.toHaveBeenCalled();
    expect(api.syncResults).toHaveBeenLastCalledWith("acct", expect.any(Array));
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
  });

  it("401 under a logged-in session also wipes the local mirror — dead account, shared browser", async () => {
    setAuth({ type: "logged-in", token: "acct", email: "a@b.com" });
    // One synced history row + one still-pending run, both the account's.
    mergeServerTrials([
      {
        id: "srv-1",
        runId: "r",
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 2,
        operands: [3, 4],
        answer: 12,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
      },
    ]);
    enqueueRun([makeInput()], [makeResult()]);
    api.syncResults.mockRejectedValueOnce(new ApiError("unauthenticated", 401));
    ensureSessionToken.mockResolvedValue("anon2");

    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(invalidateSession).toHaveBeenCalledTimes(1);
    // The dead account's mirror — synced history AND pending outbox — is
    // wiped; nothing is left for the next browser user to see or claim.
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
  });

  it("a pull resolving after logout's wipe cannot resurrect old rows", async () => {
    let resolvePull: (v: unknown) => void = () => {};
    api.fetchTrials.mockImplementation(
      () => new Promise((res) => (resolvePull = res)),
    );
    teardown = startSyncEngine();
    await tick(); // boot flush: empty outbox → fetchTrials now in-flight

    await auth.logoutHook?.("dying-tok"); // wipe + epoch bump
    resolvePull([
      {
        id: "srv-1",
        runId: "r",
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 2,
        operands: [3, 4],
        answer: 12,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
      },
    ]);
    await tick();

    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
  });

  it("a push resolving after the wipe can't recreate partial rows via markSynced", async () => {
    let resolvePush: (v: unknown) => void = () => {};
    api.syncResults
      .mockImplementationOnce(() => new Promise((res) => (resolvePush = res)))
      .mockResolvedValue({}); // the logout snapshot's own push resolves fast
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    teardown = startSyncEngine();
    await tick(); // push in-flight under "tok"

    await auth.logoutHook?.("dying-tok"); // wipes the queued row, bumps epoch
    resolvePush({});
    await tick();

    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
  });

  it("a token CHANGING kicks a flush too — login switches identity mid-queue", async () => {
    setAuth({ type: "anonymous", token: "anon-tok" });
    teardown = startSyncEngine();
    await tick();

    // Queued while anonymous; the login's token change re-kicks the flush —
    // pending rows and the pull both run under the account identity.
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    api.syncResults.mockClear();
    api.fetchTrials.mockClear();

    setAuth({ type: "logged-in", token: "acct-tok", email: "a@b.com" });
    await tick();
    expect(api.syncResults).toHaveBeenCalledWith("acct-tok", [
      expect.objectContaining({ id: input.id }),
    ]);
    expect(api.fetchTrials).toHaveBeenCalledWith("acct-tok");
  });

  it("a token appearing kicks a flush", async () => {
    // Boot while logged out with an empty outbox — nothing to push.
    setAuth({ type: "logged-out" });
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();

    enqueueRun([makeInput()], [makeResult()]);
    setAuth({ type: "anonymous", token: "fresh" });
    await tick();
    expect(api.syncResults).toHaveBeenCalledWith("fresh", expect.any(Array));
  });
});

describe("logout", () => {
  it("wipes the store atomically, then pushes the snapshot with the dying token", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();

    // A run finishes, is queued locally, and then the user logs out before
    // the background flush could land — the hook fires with the dying token.
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    const hook = auth.logoutHook?.("dying-tok");

    // Wipe-first: the table is already empty synchronously — a concurrent
    // flush under the next session can't steal or resurrect these rows.
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});

    await hook;
    expect(api.syncResults).toHaveBeenCalledWith("dying-tok", [
      expect.objectContaining({ id: input.id }),
    ]);
    // The logout flush never pulls — data is gone anyway.
    const pullCalls = api.fetchTrials.mock.calls.filter(
      ([t]) => t === "dying-tok",
    );
    expect(pullCalls).toHaveLength(0);
  });

  it("a run enqueued after logout's snapshot survives the wipe and stays pending", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();

    const doomed = makeInput();
    enqueueRun([doomed], [makeResult()]);
    const hook = auth.logoutHook?.("dying-tok");
    // New anonymous-session run lands while the dying-token push is in
    // flight — it must survive the wipe and never ride the account token.
    const newcomer = makeInput();
    enqueueRun([newcomer], [makeResult()]);
    await hook;
    await tick();

    const dyingCalls = api.syncResults.mock.calls.filter(
      ([t]) => t === "dying-tok",
    );
    const pushedIds = dyingCalls.flatMap(([, batch]) =>
      (batch as { id: string }[]).map((i) => i.id),
    );
    expect(pushedIds).toContain(doomed.id);
    expect(pushedIds).not.toContain(newcomer.id);

    expect(localStore.getRow(TRIALS_TABLE, doomed.id)).toEqual({});
    expect(localStore.getCell(TRIALS_TABLE, newcomer.id, "synced")).toBe(false);
  });

  it("wipes even when the dying-token push fails — loss is logged, never silent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();
    api.syncResults.mockRejectedValue(new Error("offline at logout"));

    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    await auth.logoutHook?.("dying-tok");

    // Deliberate policy: privacy over retention — the unsent run is
    // discarded rather than left for the next session to claim.
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("logout flush failed"),
      expect.anything(),
    );
    warn.mockRestore();
  });
});
