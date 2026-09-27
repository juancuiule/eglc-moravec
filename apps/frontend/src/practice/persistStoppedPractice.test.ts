import { describe, it, expect, vi, beforeEach } from "vitest";

// The flush is the sync engine's job — these tests only assert persist hands
// it inputs and kicks it, not that the network call happens.
const { kickSync } = vi.hoisted(() => ({ kickSync: vi.fn() }));
vi.mock("../local/syncEngine", () => ({ kickSync, flushSettled: vi.fn() }));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { pendingInputs } from "../local/trials";
import { localStore, TRIALS_TABLE } from "../local/store";
import { Addition, type TrialResult } from "engine";
import type { PracticeStopped } from "./index";

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

function makeStopped(): PracticeStopped {
  return {
    type: "stopped",
    config: { categoryCodename: "1d+1d" },
    runId: crypto.randomUUID(),
    results: [makeResult(), makeResult()],
  };
}

describe("persistStoppedPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStore.delTable(TRIALS_TABLE);
    localStore.setValue("hydrated", true);
  });

  it("enqueues fully-formed practice inputs and kicks the flush — session or not", () => {
    const before = Date.now();
    const state = makeStopped();
    persistStoppedPractice(state);
    const after = Date.now();

    const pending = pendingInputs();
    expect(pending).toHaveLength(state.results.length);
    pending.forEach((input) => {
      expect(input.id).toBeTruthy();
      expect(input.runId).toBe(state.runId);
      expect(input.runType).toBe("practice");
      expect(input.levelNumber).toBeNull();
      // playedAt is back-computed from the stop instant minus cumulative
      // timeTaken — earlier trials legitimately predate `before`.
      expect(input.playedAt).toBeLessThanOrEqual(after);
      expect(input.playedAt).toBeGreaterThan(before - 60_000);
    });
    expect(kickSync).toHaveBeenCalledTimes(1);
  });

  it("practice rows carry no levelNumber cell — rehydrated to null", () => {
    persistStoppedPractice(makeStopped());
    const table = localStore.getTable(TRIALS_TABLE);
    const [rowId, row] = Object.entries(table)[0];
    expect(row.levelNumber).toBeUndefined(); // absent cell
    expect(pendingInputs().find((i) => i.id === rowId)?.levelNumber).toBeNull();
  });
});
