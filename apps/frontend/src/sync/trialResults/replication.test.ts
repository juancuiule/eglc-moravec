import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { createAppDatabase, type AppDatabase } from "../../db/database";
import { startTrialResultsReplication } from "./replication";
import { authStore } from "../../auth/store";
import { Api } from "../../api/Api";
import type { TrialResultDocType } from "./schema";

vi.mock("../../api/Api", () => ({
  Api: {
    pushTrialResults: vi.fn(),
  },
}));

function makeTrial(overrides: Partial<TrialResultDocType> = {}): TrialResultDocType {
  return {
    id: "trial-1",
    levelNumber: 4,
    categoryCodename: "1d+1d",
    operands: [2, 3],
    answer: 5,
    timeTaken: 1200,
    playedAt: Date.now(),
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
    levelRunId: "run-abc",
    clientCorrect: true,
    clientTimeExceeded: false,
    correct: true,
    timeExceeded: false,
    ...overrides,
  };
}

describe("Trial results push replication", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    vi.resetAllMocks();
    db = await createAppDatabase(getRxStorageMemory(), `test-trials-${Math.random().toString(36).slice(2)}`);
    authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
  });

  afterEach(async () => {
    authStore.setState({ state: { type: "loggedOut" } });
    await db.close();
  });

  it("pushes a locally-inserted Trial and applies the backend's authoritative correction", async () => {
    vi.mocked(Api.pushTrialResults).mockResolvedValue([
      makeTrial({ correct: false, timeExceeded: false }), // backend disagreed with the client's claim
    ]);

    const replicationState = startTrialResultsReplication(db.trialResults);
    await db.trialResults.insert(makeTrial());
    await replicationState.awaitInitialReplication();

    expect(Api.pushTrialResults).toHaveBeenCalledWith("anon-tok", [expect.objectContaining({ id: "trial-1" })]);
    const doc = await db.trialResults.findOne("trial-1").exec();
    expect(doc?.correct).toBe(false);
    expect(doc?.clientCorrect).toBe(true); // the original claim is never overwritten

    await replicationState.cancel();
  });

  it("retries after a failed push instead of losing the Trial", async () => {
    vi.mocked(Api.pushTrialResults)
      .mockRejectedValueOnce(new Error("backend unreachable"))
      .mockResolvedValue([makeTrial()]);

    const replicationState = startTrialResultsReplication(db.trialResults, { retryTime: 20 });
    const sawError = new Promise<void>((resolve) => {
      replicationState.error$.subscribe(() => resolve());
    });

    await db.trialResults.insert(makeTrial());
    await sawError;
    await replicationState.awaitInitialReplication();

    expect(Api.pushTrialResults).toHaveBeenCalledTimes(2);

    await replicationState.cancel();
  });

  it("reads the current auth token fresh, not the one from when replication started", async () => {
    vi.mocked(Api.pushTrialResults).mockResolvedValue([makeTrial()]);
    const replicationState = startTrialResultsReplication(db.trialResults);

    // Session upgrades (anonymous -> real account) after replication is
    // already running, before anything is queued to push.
    authStore.setState({ state: { type: "loggedIn", token: "real-tok", email: "a@b.com" } });

    await db.trialResults.insert(makeTrial());
    await replicationState.awaitInitialReplication();

    expect(Api.pushTrialResults).toHaveBeenCalledWith("real-tok", expect.anything());

    await replicationState.cancel();
  });

  it("fails the push (retried later) instead of crashing when there is no session yet", async () => {
    authStore.setState({ state: { type: "loggedOut" } });
    vi.mocked(Api.pushTrialResults).mockResolvedValue([makeTrial()]);

    const replicationState = startTrialResultsReplication(db.trialResults, { retryTime: 20 });
    const sawError = new Promise<void>((resolve) => {
      replicationState.error$.subscribe(() => resolve());
    });

    await db.trialResults.insert(makeTrial());
    await sawError;
    expect(Api.pushTrialResults).not.toHaveBeenCalled();

    // A session becomes available before the retry fires — the queued
    // Trial still reaches the backend, nothing was lost.
    authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
    await replicationState.awaitInitialReplication();
    expect(Api.pushTrialResults).toHaveBeenCalledWith("anon-tok", expect.anything());

    await replicationState.cancel();
  });
});
