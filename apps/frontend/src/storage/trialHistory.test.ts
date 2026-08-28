import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPersistedTrials, loadTrialHistory, appendTrials } from "./trialHistory";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "./practiceHistory";
import { resetLocalStore } from "./store";
import { Addition, Multiplication } from "engine";
import type { TrialResult } from "../game/index";
import type { Level } from "../level";

beforeEach(() => {
  resetLocalStore();
});

// A fixed fixture, not the real catalog's level 1 — tests shouldn't depend
// on production Level content (which now lives in the backend).
const LEVEL_FIXTURE: Level = { "1d+1d": 50, "1dx1d": 50 };
const config = { levelNumber: 7, level: LEVEL_FIXTURE, totalTrials: 20 };
const RUN_ID = "run-abc-123";

function makeResult(overrides: Partial<TrialResult> = {}): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    hintShown: false,
    keystrokes: [{ key: "1", t: 100 }],
    hasErased: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    ...overrides,
  };
}

describe("buildPersistedTrials", () => {
  it("maps each result to the persisted-trial shape", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const result = makeResult();
    const [persisted] = buildPersistedTrials(config, [result], RUN_ID);

    expect(persisted.levelNumber).toBe(7);
    expect(persisted.categoryCodename).toBe(result.operation.categoryCodename());
    expect(persisted.correct).toBe(true);
    expect(persisted.timeExceeded).toBe(false);
    expect(persisted.timeTaken).toBe(1200);
    expect(persisted.keystrokes).toBe(result.keystrokes);
    expect(persisted.hintShown).toBe(false);
    expect(persisted.streakAtSubmit).toBe(0);
    expect(persisted.hintsAvailableAtStart).toBe(3);
    expect(persisted.runId).toBe(RUN_ID);
    expect(persisted.playedAt).toBe("2026-01-01T00:00:00.000Z");

    vi.useRealTimers();
  });

  it("carries the category codename from each result's own operation", () => {
    const additionOp = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
    const multOp = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });

    const persisted = buildPersistedTrials(
      config,
      [makeResult({ operation: additionOp }), makeResult({ operation: multOp })],
      RUN_ID,
    );

    expect(persisted[0].categoryCodename).toBe("1d+1d");
    expect(persisted[1].categoryCodename).toBe("1dx1d");
  });

  it("returns an empty array for no results", () => {
    expect(buildPersistedTrials(config, [], RUN_ID)).toEqual([]);
  });

  it("assigns each trial its own unique id", () => {
    const persisted = buildPersistedTrials(config, [makeResult(), makeResult()], RUN_ID);
    expect(persisted[0].id).toBeTruthy();
    expect(persisted[0].id).not.toBe(persisted[1].id);
  });

  it("carries operands and answer from each result's own operation — needed for the backend to re-validate later", () => {
    const result = makeResult();
    const [persisted] = buildPersistedTrials(config, [result], RUN_ID);
    expect(persisted.operands).toEqual(result.operation.operands());
    expect(persisted.answer).toBe(result.answer);
  });

  it("assigns each trial its own timestamp, working backward by timeTaken from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

    const persisted = buildPersistedTrials(
      config,
      [makeResult({ timeTaken: 1000 }), makeResult({ timeTaken: 2000 }), makeResult({ timeTaken: 3000 })],
      RUN_ID,
    );

    const timestamps = persisted.map((p) => p.playedAt);
    expect(new Set(timestamps).size).toBe(3);
    expect(timestamps).toEqual([
      "2026-01-01T00:00:05.000Z",
      "2026-01-01T00:00:07.000Z",
      "2026-01-01T00:00:10.000Z",
    ]);

    vi.useRealTimers();
  });
});

describe("loadTrialHistory / appendTrials", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(loadTrialHistory()).toEqual([]);
  });

  it("round-trips appended trials through the store, including operands and answer", () => {
    const persisted = buildPersistedTrials(config, [makeResult()], RUN_ID);
    appendTrials(persisted);

    expect(loadTrialHistory()).toEqual(persisted);
  });

  it("round-trips a timed-out trial's null answer", () => {
    const persisted = buildPersistedTrials(config, [makeResult({ answer: null })], RUN_ID);
    appendTrials(persisted);

    expect(loadTrialHistory()[0].answer).toBeNull();
  });

  it("accumulates across multiple appends", () => {
    appendTrials(buildPersistedTrials(config, [makeResult()], RUN_ID));
    appendTrials(buildPersistedTrials(config, [makeResult(), makeResult()], RUN_ID));

    expect(loadTrialHistory()).toHaveLength(3);
  });

  it("does not touch the store when appending an empty list", () => {
    appendTrials([]);
    expect(loadTrialHistory()).toEqual([]);
  });

  it("excludes Practice trials stored in the same underlying table", () => {
    appendTrials(buildPersistedTrials(config, [makeResult()], RUN_ID));
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult()], "practice-run-1"));

    expect(loadTrialHistory()).toHaveLength(1);
  });
});
