import { beforeEach, describe, expect, it, vi } from "vitest";
import { localStore, resetLocalData, TRIALS_TABLE } from "./store";
import {
  allLocalTrials,
  enqueueRun,
  levelStatsFromTrials,
  markSynced,
  mergeLevelStats,
  mergeServerTrials,
  pendingInputs,
  rowToSyncedTrial,
} from "./trials";
import type { SyncedTrial } from "../api/Api";
import { Addition } from "engine";
import type { TrialResultInput, TrialResult } from "engine";

function makeInput(
  overrides: Partial<TrialResultInput> = {},
): TrialResultInput {
  const base = {
    id: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    categoryCodename: "1dx1d",
    timeTaken: 800,
    playedAt: 1_700_000_000_000,
    operands: [6, 7],
    answer: 42,
    hintShown: false,
  };
  return overrides.runType === "practice"
    ? {
        ...base,
        ...overrides,
        runType: "practice",
        levelNumber: null,
      }
    : { ...base, ...overrides, runType: "level", levelNumber: 3 };
}

function makeResult(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    operation: Addition.create({
      type: "addition",
      codename: "1d+1d",
      lDigits: 1,
      rDigits: 1,
    }),
    answer: 2,
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
    ...overrides,
  };
}

function makeSynced(overrides: Partial<SyncedTrial> = {}): SyncedTrial {
  return {
    id: "srv-1",
    runId: "run-srv",
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
    ...overrides,
  };
}

beforeEach(() => {
  localStore.delTables();
});

describe("enqueueRun", () => {
  it("writes one unsynced row per input, keyed by input.id", () => {
    enqueueRun(
      [
        makeInput(),
        makeInput({ id: crypto.randomUUID(), playedAt: 1_700_000_001_000 }),
      ],
      [makeResult(), makeResult()],
    );
    const table = localStore.getTable(TRIALS_TABLE);
    expect(Object.keys(table)).toHaveLength(2);
    expect(Object.values(table).every((r) => r.synced === false)).toBe(true);
  });

  it("stores operands as JSON and display copies of correct/timeExceeded", () => {
    const input = makeInput();
    enqueueRun([input], [makeResult({ correct: false, timeExceeded: true })]);
    const row = localStore.getRow(TRIALS_TABLE, input.id);
    expect(row.operands).toBe("[6,7]");
    expect(row.correct).toBe(false);
    expect(row.timeExceeded).toBe(true);
  });

  it("omits answer/levelNumber cells for timed-out and practice rows", () => {
    const timeout = makeInput({ answer: null });
    const practice = makeInput({ runType: "practice", levelNumber: null });
    enqueueRun([timeout, practice], [makeResult(), makeResult()]);
    const table = localStore.getTable(TRIALS_TABLE);
    expect(table[timeout.id].answer).toBeUndefined();
    expect(table[practice.id].levelNumber).toBeUndefined();
  });

  it("round-trips a row back to its input and display shapes", () => {
    const input = makeInput({
      runType: "practice",
      levelNumber: null,
      answer: null,
    });
    enqueueRun([input], [makeResult({ correct: false })]);
    const [rowId, row] = Object.entries(localStore.getTable(TRIALS_TABLE))[0];
    const trial = rowToSyncedTrial(rowId, row);
    expect(trial.answer).toBeNull();
    expect(trial.levelNumber).toBeNull();
    expect(trial.operands).toEqual([6, 7]);
    expect(pendingInputs()[0]).toEqual(input);
  });

  it("drops a malformed input and keeps the rest — a bad row must not poison the queue", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const good = makeInput();
    const bad = { ...makeInput(), timeTaken: -5 };
    enqueueRun([good, bad as TrialResultInput], [makeResult(), makeResult()]);
    expect(pendingInputs().map((i) => i.id)).toEqual([good.id]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("re-enqueueing an id already synced leaves the acknowledged row alone", () => {
    const input = makeInput();
    enqueueRun([input], [makeResult()]);
    markSynced([input.id]);
    enqueueRun([input], [makeResult()]);
    expect(localStore.getCell(TRIALS_TABLE, input.id, "synced")).toBe(true);
  });
});

describe("pendingInputs / markSynced", () => {
  it("returns only unsynced rows; markSynced removes them", () => {
    const [first, second] = [makeInput(), makeInput()];
    enqueueRun([first, second], [makeResult(), makeResult()]);
    expect(pendingInputs()).toHaveLength(2);
    markSynced([first.id]);
    expect(pendingInputs().map((i) => i.id)).toEqual([second.id]);
  });
});

describe("mergeServerTrials", () => {
  it("upserts server rows as synced, with server-authoritative fields", () => {
    mergeServerTrials([makeSynced()]);
    const row = localStore.getRow(TRIALS_TABLE, "srv-1");
    expect(row.synced).toBe(true);
    expect(row.correct).toBe(true);
    expect(pendingInputs()).toHaveLength(0);
  });

  it("acknowledges a pending row when the server echoes it back", () => {
    const input = makeInput();
    enqueueRun([input], [makeResult({ correct: false })]);
    mergeServerTrials([
      makeSynced({
        id: input.id,
        correct: true,
        levelNumber: 3,
        operands: [6, 7],
      }),
    ]);
    const row = localStore.getRow(TRIALS_TABLE, input.id);
    expect(row.synced).toBe(true);
    // Server's evaluation wins over the local display copy.
    expect(row.correct).toBe(true);
  });

  it("allLocalTrials returns trials sorted by playedAt", () => {
    mergeServerTrials([
      makeSynced({ id: "b", playedAt: 2000 }),
      makeSynced({ id: "a", playedAt: 1000 }),
    ]);
    expect(allLocalTrials().map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("localLevelStats / mergeLevelStats", () => {
  it("derives stats from level runs — practice rows excluded", () => {
    enqueueRun(
      [makeInput({ runType: "practice", levelNumber: null })],
      [makeResult()],
    );
    const stats = levelStatsFromTrials(allLocalTrials());
    expect(Object.keys(stats)).toHaveLength(0);
  });

  it("mergeLevelStats keeps the better record per level", () => {
    const merged = mergeLevelStats(
      { "3": { stars: 1, totalTime: 5000, completedAt: "x" } },
      { "3": { stars: 2, totalTime: 6000, completedAt: "y" } },
    );
    expect(merged["3"].stars).toBe(2);
    expect(
      mergeLevelStats(merged, {
        "3": { stars: 1, totalTime: 1000, completedAt: "z" },
      })["3"].stars,
    ).toBe(2);
  });
});

describe("resetLocalData", () => {
  it("wipes the trials table; the live store stays hydrated", () => {
    localStore.setValue("hydrated", true);
    enqueueRun([makeInput()], [makeResult()]);
    resetLocalData();
    expect(allLocalTrials()).toHaveLength(0);
    expect(localStore.getValue("hydrated")).toBe(true);
  });
});
