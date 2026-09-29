import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Fakes ---------------------------------------------------------------

const { api, auth, ensureSessionToken, invalidateSession, persistence } =
  vi.hoisted(() => {
    const api = {
      syncResults: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
      fetchTrials: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
      fetchAllLevels: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const auth = {
      state: { type: "logged-out" } as
        | { type: "logged-out" }
        | { type: "anonymous"; token: string }
        | { type: "logged-in"; token: string; email: string },
      subscribers: new Set<(s: never, p: never) => void>(),
      logoutHook: undefined as
        undefined | ((token: string, email: string) => Promise<void>),
    };
    const ensureSessionToken = vi.fn<() => Promise<string | null>>();
    const invalidateSession = vi.fn(() => {
      auth.state = { type: "logged-out" };
    });
    // Controllable stand-in for the IndexedDB persister: `loading` gates
    // afterHydration, `hydrate()` fires the deferred callbacks (in whatever
    // order a test wants — nothing may depend on it), persistNow is a spy.
    const persistence = {
      loading: false,
      deferred: [] as Array<() => void>,
      persistNow: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
      hydrate(order: "registration" | "reverse" = "registration") {
        persistence.loading = false;
        const fns = persistence.deferred.splice(0);
        (order === "reverse" ? fns.reverse() : fns).forEach((fn) => fn());
      },
    };
    return { api, auth, ensureSessionToken, invalidateSession, persistence };
  });

vi.mock("./store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./store")>();
  return {
    ...mod,
    isPersistenceLoading: () => persistence.loading,
    afterHydration: (fn: () => void) => {
      if (persistence.loading) persistence.deferred.push(fn);
      else fn();
    },
    persistNow: () => persistence.persistNow(),
  };
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
import { readStashedRows, stashPendingRows } from "./accountStash";
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
  localStorage.clear();
  persistence.loading = false;
  persistence.deferred = [];
  persistence.persistNow.mockImplementation(() => Promise.resolve(false));
  setAuth({ type: "anonymous", token: "tok" });
  setOnline(true);
  api.syncResults.mockResolvedValue({});
  api.fetchTrials.mockResolvedValue([]);
  api.fetchAllLevels.mockResolvedValue([]);
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
        id: "99999999-9999-4999-8999-999999999999",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    expect(
      localStore.getRow(TRIALS_TABLE, "99999999-9999-4999-8999-999999999999")
        .synced,
    ).toBe(true);
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
        id: "11111111-1111-4111-8111-111111111111",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    api.syncResults.mockRejectedValueOnce(new ApiError("unauthenticated", 401));
    ensureSessionToken.mockResolvedValue("anon2");

    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(invalidateSession).toHaveBeenCalledTimes(1);
    // The dead account's mirror — synced history AND pending outbox — is
    // wiped; nothing is left for the next browser user to see or claim.
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    // The pending run was parked under the account's email, not dropped.
    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(input.id);
  });

  it("re-login to the same account restores parked trials and pushes them under the new token", async () => {
    setAuth({ type: "logged-in", token: "acct", email: "a@b.com" });
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    api.syncResults.mockRejectedValueOnce(new ApiError("unauthenticated", 401));
    ensureSessionToken.mockResolvedValue("anon2");
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});

    // The account signs back in — the stash re-enters the outbox and
    // flushes under the fresh account token, never the anonymous one.
    setAuth({ type: "logged-in", token: "acct2", email: "a@b.com" });
    await flushSettled();
    await tick();

    expect(api.syncResults).toHaveBeenLastCalledWith("acct2", [
      expect.objectContaining({ id: input.id }),
    ]);
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
  });

  it("a different account's sign-in leaves the stash parked — and a later same-account login still recovers it", async () => {
    setAuth({ type: "logged-in", token: "acct", email: "a@b.com" });
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    api.syncResults.mockRejectedValueOnce(new ApiError("unauthenticated", 401));
    ensureSessionToken.mockResolvedValue("anon2");
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    // Bob signs in — Alice's parked run must not enter his outbox.
    setAuth({ type: "logged-in", token: "bob", email: "bob@x.com" });
    await flushSettled();
    await tick();
    expect(localStore.getRow(TRIALS_TABLE, input.id)).toEqual({});
    const pushedToBob = api.syncResults.mock.calls
      .filter(([t]) => t === "bob")
      .flatMap(([, batch]) => (batch as { id: string }[]).map((i) => i.id));
    expect(pushedToBob).not.toContain(input.id);

    // Alice returns on this device — her run comes back and syncs to her.
    setAuth({ type: "anonymous", token: "anon3" });
    setAuth({ type: "logged-in", token: "acct3", email: "a@b.com" });
    await flushSettled();
    await tick();
    expect(api.syncResults).toHaveBeenLastCalledWith("acct3", [
      expect.objectContaining({ id: input.id }),
    ]);
  });

  it("restored rows keep their parked copy until durable — a push ACK releases it", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    // Alice's parked run from a dead session — restored on her sign-in.
    const rowId = crypto.randomUUID();
    stashPendingRows("a@b.com", [
      {
        id: rowId,
        runId: crypto.randomUUID(),
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 2,
        operands: "[3,4]",
        answer: 12,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
        synced: false,
      },
    ]);

    // Restore writes the rows but the push hasn't landed — a reload here
    // must still find the stash (no persister in tests → persistNow can't
    // confirm durability, so only the ACK releases it).
    let resolvePush: (v: unknown) => void = () => {};
    api.syncResults.mockImplementation(
      () => new Promise((res) => (resolvePush = res)),
    );
    setAuth({ type: "logged-in", token: "acct2", email: "a@b.com" });
    await tick();
    expect(localStore.getCell(TRIALS_TABLE, rowId, "synced")).toBe(false);
    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(rowId);

    resolvePush({});
    await flushSettled();
    await tick();
    expect(localStore.getCell(TRIALS_TABLE, rowId, "synced")).toBe(true);
    expect(readStashedRows("a@b.com")).toEqual([]);
  });

  it("a pull resolving after logout's wipe cannot resurrect old rows", async () => {
    let resolvePull: (v: unknown) => void = () => {};
    api.fetchTrials.mockImplementation(
      () => new Promise((res) => (resolvePull = res)),
    );
    teardown = startSyncEngine();
    await tick(); // boot flush: empty outbox → fetchTrials now in-flight

    await auth.logoutHook?.("dying-tok", "a@b.com"); // wipe + epoch bump
    resolvePull([
      {
        id: "11111111-1111-4111-8111-111111111111",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

    await auth.logoutHook?.("dying-tok", "a@b.com"); // wipes the queued row, bumps epoch
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

  it("a settled pass refreshes the level catalog snapshot", async () => {
    api.fetchAllLevels.mockResolvedValue([
      { levelNumber: 1, mix: { "1d+1d": 100 } },
    ]);
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(api.fetchAllLevels).toHaveBeenCalled();
    expect(localStore.getRow("levels", "1")).toEqual({
      mix: '{"1d+1d":100}',
    });
    expect(localStore.getValue("levelNumbers")).toBe("[1]");
  });

  it("a failed pass does not refresh the catalog", async () => {
    api.fetchTrials.mockRejectedValue(new Error("unreachable"));
    teardown = startSyncEngine();
    await flushSettled();
    await tick();

    expect(api.fetchAllLevels).not.toHaveBeenCalled();
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
    const hook = auth.logoutHook?.("dying-tok", "a@b.com");

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
    // The durable parked copy is dropped once the push is acknowledged.
    expect(readStashedRows("a@b.com")).toEqual([]);
  });

  it("a run enqueued after logout's snapshot survives the wipe and stays pending", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();

    const doomed = makeInput();
    enqueueRun([doomed], [makeResult()]);
    const hook = auth.logoutHook?.("dying-tok", "a@b.com");
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

  it("an undelivered logout push parks rows for the account's next sign-in — nothing is dropped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockClear();
    api.syncResults.mockRejectedValue(new Error("offline at logout"));

    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    await auth.logoutHook?.("dying-tok", "a@b.com");

    // Shared store stays wiped for the next browser user, but the rows are
    // parked under the account's email — restored on re-login, never lost.
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(input.id);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("undelivered"));
    warn.mockRestore();
  });

  it("a failed park does not license the wipe — rows are held for the dying-token push, then wiped", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    // The synced mirror must still go at logout even when parking fails.
    mergeServerTrials([
      {
        id: "55555555-5555-4555-8555-555555555555",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 1,
        operands: [1, 2],
        answer: 2,
        correct: true,
        timeExceeded: false,
        timeTaken: 500,
        hintShown: false,
        playedAt: 1_700_000_000_000,
      },
    ]);
    api.syncResults.mockClear();
    let resolvePush: (v: unknown) => void = () => {};
    api.syncResults.mockImplementation(
      () => new Promise((res) => (resolvePush = res)),
    );
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    const hook = auth.logoutHook?.("dying-tok", "a@b.com");
    await tick();

    // Park failed → the outbox is the only copy: still there, mirror gone.
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(false);
    expect(
      localStore.getRow(TRIALS_TABLE, "55555555-5555-4555-8555-555555555555"),
    ).toEqual({});
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("could not park"),
    );
    // And no other flush may claim it under the next identity meanwhile.
    const kicked = flushSettled();
    setAuth({ type: "anonymous", token: "next-anon" });
    await tick();
    expect(
      api.syncResults.mock.calls.filter(([t]) => t === "next-anon"),
    ).toEqual([]);

    resolvePush({});
    await hook;
    void kicked;
    await tick();
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    expect(api.syncResults.mock.calls.map(([t]) => t)).toContain("dying-tok");
    setItem.mockRestore();
    error.mockRestore();
  });

  it("park AND push both failing re-attempts the park before the final wipe", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    let rejectPush: (e: unknown) => void = () => {};
    api.syncResults.mockImplementation(
      () => new Promise((_, rej) => (rejectPush = rej)),
    );
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    const hook = auth.logoutHook?.("dying-tok", "a@b.com");
    await tick();
    setItem.mockRestore(); // storage recovers before the push fails
    rejectPush(new Error("offline"));
    await hook;

    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(input.id);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining("lost"));
    error.mockRestore();
  });

  it("a restore's durable-write confirmation landing after a logout does not release the re-parked copy", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    const rowId = crypto.randomUUID();
    stashPendingRows("a@b.com", [
      {
        id: rowId,
        runId: crypto.randomUUID(),
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 2,
        operands: "[3,4]",
        answer: 12,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
        synced: false,
      },
    ]);
    let confirmSave: (ok: boolean) => void = () => {};
    persistence.persistNow.mockImplementation(
      () => new Promise((res) => (confirmSave = res)),
    );
    // Pushes hang until the end of the test — neither the restore's nor
    // the logout's can land before the save confirmation does.
    const pushes: Array<(v: unknown) => void> = [];
    api.syncResults.mockImplementation(
      () => new Promise((res) => pushes.push(res)),
    );

    setAuth({ type: "logged-in", token: "acct", email: "a@b.com" });
    await tick();
    expect(localStore.getCell(TRIALS_TABLE, rowId, "synced")).toBe(false);

    // Logout before the IndexedDB save resolves: re-parks and wipes.
    void auth.logoutHook?.("acct", "a@b.com");
    await tick();
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
    // The stale save confirmation belongs to the wiped session — the
    // re-parked copy must survive it.
    confirmSave(true);
    await tick();
    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(rowId);

    pushes.forEach((res) => res({}));
    await tick();
  });

  it("a run finished mid-hydration is drained into the logout snapshot regardless of listener order", async () => {
    teardown = startSyncEngine();
    await flushSettled();
    await tick();
    api.syncResults.mockRejectedValue(new Error("offline at logout"));

    persistence.loading = true;
    const input = makeInput();
    enqueueRun([input], [makeResult()]); // queued, not written
    expect(localStore.getRow(TRIALS_TABLE, input.id)).toEqual({});
    const hook = auth.logoutHook?.("dying-tok", "a@b.com");
    // Worst case for the old implementation: the logout callback fires
    // BEFORE the deferred enqueue's own hydration callback.
    persistence.hydrate("reverse");
    await hook;

    expect(readStashedRows("a@b.com").map((r) => r.id)).toContain(input.id);
    expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
  });

  describe("park-failure branch keeps the next session's runs", () => {
    async function logoutWithParkFailure(settle: "deliver" | "fail") {
      vi.spyOn(console, "error").mockImplementation(() => {});
      teardown = startSyncEngine();
      await flushSettled();
      await tick();
      let settlePush: (v: unknown) => void = () => {};
      let failPush: (e: unknown) => void = () => {};
      api.syncResults.mockImplementation(
        () =>
          new Promise((res, rej) => {
            settlePush = res;
            failPush = rej;
          }),
      );
      const setItem = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota exceeded");
        });

      const old = makeInput();
      enqueueRun([old], [makeResult()]);
      const hook = auth.logoutHook?.("dying-tok", "a@b.com");
      await tick();
      // Bob (the re-minted anonymous session) finishes a run while Alice's
      // dying-token push is still in flight — same table, post-snapshot.
      setAuth({ type: "anonymous", token: "bob-anon" });
      const newcomer = makeInput();
      enqueueRun([newcomer], [makeResult()]);

      if (settle === "deliver") settlePush({});
      else failPush(new Error("offline"));
      await hook;
      await tick();
      setItem.mockRestore();
      return { old, newcomer };
    }

    it("delivered push: the deferred wipe removes only the old outbox", async () => {
      const { old, newcomer } = await logoutWithParkFailure("deliver");
      expect(localStore.getRow(TRIALS_TABLE, old.id)).toEqual({});
      expect(localStore.getRow(TRIALS_TABLE, newcomer.id)).not.toEqual({});
    });

    it("failed push: newcomer survives, old rows are gone from the table (re-parked if storage recovered)", async () => {
      const { old, newcomer } = await logoutWithParkFailure("fail");
      expect(localStore.getRow(TRIALS_TABLE, old.id)).toEqual({});
      expect(localStore.getRow(TRIALS_TABLE, newcomer.id)).not.toEqual({});
      // And the newcomer proceeds to sync under its own identity now that
      // the wipe flag is cleared.
      api.syncResults.mockResolvedValue({});
      kickSync();
      await flushSettled();
      await tick();
      expect(
        api.syncResults.mock.calls.some(
          ([t, batch]) =>
            t === "bob-anon" &&
            (batch as { id: string }[]).some((i) => i.id === newcomer.id),
        ),
      ).toBe(true);
    });
  });
});
