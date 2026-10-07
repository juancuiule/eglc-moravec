import { describe, it, expect, vi, beforeEach } from "vitest";

// The flush is the sync engine's job — these tests only assert persist hands
// it inputs and kicks it, not that the network call happens.
const { kickSync } = vi.hoisted(() => ({ kickSync: vi.fn() }));
vi.mock("../local/syncEngine", () => ({ kickSync, flushSettled: vi.fn() }));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { pendingInputs } from "../local/trials";
import { localStore, TRIALS_TABLE } from "../local/store";
import { Addition, type RecordedTrialResult } from "engine";
import type { PracticeStopped } from "./index";

function makeResult(): RecordedTrialResult {
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
    timeTaken: 800,
    hintShown: false,
  };
}

function makeStopped(): PracticeStopped {
  return {
    type: "stopped",
    config: { mode: "category", categoryCodename: "1d+1d" },
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
    const state = makeStopped();
    persistStoppedPractice(state);

    const pending = pendingInputs();
    expect(pending).toHaveLength(state.results.length);
    state.results.forEach((result) => {
      // Each row keeps the identity minted when its Trial was scored.
      const input = pending.find((i) => i.id === result.id);
      expect(input?.playedAt).toBe(result.playedAt);
      expect(input?.runId).toBe(state.runId);
      expect(input?.runType).toBe("practice");
      expect(input?.levelNumber).toBeNull();
    });
    expect(kickSync).toHaveBeenCalledTimes(1);
  });

  it("marks Focus-session trials as practice_focus so analysis can filter the adaptive mix", () => {
    const stopped = makeStopped();
    persistStoppedPractice({
      ...stopped,
      config: { mode: "focus", weights: { "1d+1d": 1 } },
    });

    const pending = pendingInputs();
    expect(pending).toHaveLength(stopped.results.length);
    pending.forEach((input) => {
      expect(input.runType).toBe("practice_focus");
      expect(input.levelNumber).toBeNull();
      expect(input.runId).toBe(stopped.runId);
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
