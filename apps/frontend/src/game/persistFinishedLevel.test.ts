import { describe, it, expect, vi, beforeEach } from "vitest";

// The flush is the sync engine's job — these tests only assert persist hands
// it inputs and kicks it, not that the network call happens.
const { flushSettled } = vi.hoisted(() => ({
  flushSettled: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));
vi.mock("../local/syncEngine", () => ({ flushSettled, kickSync: vi.fn() }));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { enqueueRun, pendingInputs } from "../local/trials";
import { localStore, TRIALS_TABLE } from "../local/store";
import { Addition, toTrialResultInput, type RecordedTrialResult } from "engine";
import type { Level } from "../level";
import { policy, type Finished } from "./index";
import type { LevelStats } from "../api/Api";

// A fixed fixture, not the real catalog's level 1 — tests shouldn't depend
// on production Level content (which now lives in the backend).
const LEVEL_FIXTURE: Level = { "1d+1d": 50, "1dx1d": 50 };

function makeResult(timeTaken: number): RecordedTrialResult {
  const op = Addition.create({
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
  return {
    id: crypto.randomUUID(),
    playedAt: 1_700_000_000_000,
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken,
    hintShown: false,
  };
}

function makeFinished(): Finished {
  return {
    type: "finished",
    config: { levelNumber: 4, level: LEVEL_FIXTURE },
    runId: crypto.randomUUID(),
    // A full Level's worth — partial runs never derive a record.
    results: Array.from({ length: 20 }, (_, i) =>
      makeResult(i % 2 === 0 ? 1000 : 1500),
    ),
    correctCount: 20,
    levelCompleted: true,
    stars: 2,
  };
}

// What persistScoredTrials did as each Trial was scored.
function enqueueScored(state: Finished): void {
  const recordPolicy = policy.recordPolicy(state.config, state.runId);
  enqueueRun(
    state.results.map((r) => toTrialResultInput(r, recordPolicy)),
    state.results,
  );
}

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flushSettled.mockResolvedValue(undefined);
    localStore.delTable(TRIALS_TABLE);
    localStore.setValue("hydrated", true);
  });

  it("isNewRecord is true when there's no previous record for the level", () => {
    expect(persistFinishedLevel(makeFinished(), undefined).isNewRecord).toBe(
      true,
    );
  });

  it("writes no rows — every Trial was saved as it was scored", () => {
    // A mid-Level logout already parked these rows for the outgoing
    // account; re-writing them here would push them under the next one.
    persistFinishedLevel(makeFinished(), undefined);
    expect(pendingInputs()).toEqual([]);
  });

  it("refreshed resolves to the locally-derived record once the flush settles", async () => {
    const state = makeFinished();
    enqueueScored(state);
    const { refreshed } = persistFinishedLevel(state, undefined);
    const fresh = await refreshed;
    expect(flushSettled).toHaveBeenCalled();
    // stars derive from the trials themselves (20 correct → 3 stars), not
    // the session's declared value (2) — same rule the backend applies.
    expect(fresh.stars).toBe(3);
    expect(fresh.totalTime).toBe(25000);
  });

  it("refreshed resolves to the record when the flush rejects", async () => {
    flushSettled.mockRejectedValueOnce(new Error("offline"));
    const { record, refreshed } = persistFinishedLevel(
      makeFinished(),
      undefined,
    );
    await expect(refreshed).resolves.toBe(record);
  });

  it("the record ratchet keeps working across calls", () => {
    const first = persistFinishedLevel(makeFinished(), undefined);
    expect(first.isNewRecord).toBe(true);

    // Second run — a better 3-star run wins against the stored record.
    const better: Finished = {
      ...makeFinished(),
      runId: crypto.randomUUID(),
      stars: 3,
    };
    const second = persistFinishedLevel(better, first.record);
    expect(second.isNewRecord).toBe(true);

    // A third run, same as the first (2 stars) — now loses against the
    // ratcheted best (3 stars), proving the ratchet actually took hold.
    const third = persistFinishedLevel(makeFinished(), second.record);
    expect(third.isNewRecord).toBe(false);
  });
});
