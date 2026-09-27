import { describe, it, expect, vi, beforeEach } from "vitest";

// The flush is the sync engine's job — these tests only assert persist hands
// it inputs and kicks it, not that the network call happens.
const { flushSettled } = vi.hoisted(() => ({
  flushSettled: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));
vi.mock("../local/syncEngine", () => ({ flushSettled, kickSync: vi.fn() }));

import { persistFinishedLevel } from "./persistFinishedLevel";
import {
  allLocalTrials,
  localLevelStats,
  pendingInputs,
} from "../local/trials";
import { localStore, TRIALS_TABLE } from "../local/store";
import { Addition, type TrialResult } from "engine";
import type { Level } from "../level";
import type { Finished } from "./index";
import type { LevelStats } from "../api/Api";

// A fixed fixture, not the real catalog's level 1 — tests shouldn't depend
// on production Level content (which now lives in the backend).
const LEVEL_FIXTURE: Level = { "1d+1d": 50, "1dx1d": 50 };

function makeResult(timeTaken: number): TrialResult {
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
    timeTaken,
    hintShown: false,
  };
}

function makeFinished(): Finished {
  return {
    type: "finished",
    config: { levelNumber: 4, level: LEVEL_FIXTURE, totalTrials: 20 },
    runId: crypto.randomUUID(),
    results: [makeResult(1000), makeResult(1500)],
    correctCount: 2,
    levelCompleted: true,
    stars: 2,
  };
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

  it("enqueues fully-formed trial inputs into the outbox — ids and playedAt frozen at finish time", () => {
    const before = Date.now();
    const state = makeFinished();
    persistFinishedLevel(state, undefined);
    const after = Date.now();

    const pending = pendingInputs();
    expect(pending).toHaveLength(state.results.length);
    pending.forEach((input, i) => {
      expect(input.id).toBeTruthy();
      expect(input.runId).toBe(state.runId);
      expect(input.runType).toBe("level");
      expect(input.levelNumber).toBe(4);
      expect(input.categoryCodename).toBe(
        state.results[i].operation.categoryCodename(),
      );
      // playedAt is back-computed per-trial from the finish instant minus
      // cumulative timeTaken — earlier trials legitimately predate `before`.
      expect(input.playedAt).toBeLessThanOrEqual(after);
      expect(input.playedAt).toBeGreaterThan(before - 60_000);
    });
  });

  it("enqueues even with no session — the engine owns session establishment", () => {
    persistFinishedLevel(makeFinished(), undefined);
    expect(pendingInputs().length).toBeGreaterThan(0);
  });

  it("local read model counts the just-finished run immediately, synced or not", () => {
    persistFinishedLevel(makeFinished(), undefined);
    const stats = localLevelStats();
    expect(stats["4"]).toBeDefined();
    // stars derive from the trials themselves (2 correct → 0 stars), not the
    // session's declared value — same rule the backend applies.
    expect(stats["4"].stars).toBe(0);
    expect(stats["4"].totalTime).toBe(2500);
    expect(allLocalTrials().every((t) => t.runType === "level")).toBe(true);
  });

  it("refreshed resolves to the locally-derived record once the flush settles", async () => {
    const { refreshed } = persistFinishedLevel(makeFinished(), undefined);
    const fresh = await refreshed;
    expect(flushSettled).toHaveBeenCalled();
    expect(fresh.stars).toBe(0);
    expect(fresh.totalTime).toBe(2500);
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
