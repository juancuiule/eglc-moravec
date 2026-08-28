import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildPersistedPracticeTrials,
  loadPracticeHistory,
  appendPracticeTrials,
} from "./practiceHistory";
import { resetLocalStore } from "./store";
import { buildPersistedTrials, appendTrials } from "./trialHistory";
import { Addition, Multiplication, type BaseTrialResult } from "engine";
import type { Level } from "../level";

const LEVEL_FIXTURE: Level = { "1d+1d": 50 };
const levelConfig = { levelNumber: 1, level: LEVEL_FIXTURE, totalTrials: 20 };

const RUN_ID = "practice-run-abc-123";

beforeEach(() => {
  resetLocalStore();
});

function makeResult(overrides: Partial<BaseTrialResult> = {}): BaseTrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 900,
    hintShown: false,
    keystrokes: [{ key: "1", t: 50 }],
    hasErased: false,
    ...overrides,
  };
}

describe("buildPersistedPracticeTrials", () => {
  it("maps each result to the persisted-practice-trial shape, with no levelNumber field", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const result = makeResult();
    const [persisted] = buildPersistedPracticeTrials([result], RUN_ID);

    expect(persisted.id).toBeTruthy();
    expect(persisted).not.toHaveProperty("levelNumber");
    expect(persisted.categoryCodename).toBe(result.operation.categoryCodename());
    expect(persisted.correct).toBe(true);
    expect(persisted.timeExceeded).toBe(false);
    expect(persisted.timeTaken).toBe(900);
    expect(persisted.keystrokes).toBe(result.keystrokes);
    expect(persisted.playedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(persisted.hintShown).toBe(false);
    expect(persisted.runId).toBe(RUN_ID);

    vi.useRealTimers();
  });

  it("carries the category codename from each result's own operation", () => {
    const additionOp = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
    const multOp = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });

    const persisted = buildPersistedPracticeTrials(
      [makeResult({ operation: additionOp }), makeResult({ operation: multOp })],
      RUN_ID,
    );

    expect(persisted[0].categoryCodename).toBe("1d+1d");
    expect(persisted[1].categoryCodename).toBe("1dx1d");
  });

  it("returns an empty array for no results", () => {
    expect(buildPersistedPracticeTrials([], RUN_ID)).toEqual([]);
  });

  it("assigns each trial its own timestamp, working backward by timeTaken from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

    const persisted = buildPersistedPracticeTrials(
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

describe("loadPracticeHistory / appendPracticeTrials", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(loadPracticeHistory()).toEqual([]);
  });

  it("round-trips appended trials through storage", () => {
    const persisted = buildPersistedPracticeTrials([makeResult()], RUN_ID);
    appendPracticeTrials(persisted);

    expect(loadPracticeHistory()).toEqual(persisted);
  });

  it("accumulates across multiple appends", () => {
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult()], RUN_ID));
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult(), makeResult()], RUN_ID));

    expect(loadPracticeHistory()).toHaveLength(3);
  });

  it("does not touch the store when appending an empty list", () => {
    appendPracticeTrials([]);
    expect(loadPracticeHistory()).toEqual([]);
  });

  it("excludes Level trials stored in the same underlying table", () => {
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult()], RUN_ID));
    appendTrials(
      buildPersistedTrials(levelConfig, [{ ...makeResult(), streakAtSubmit: 0, hintsAvailableAtStart: 3 }], "level-run-1"),
    );

    expect(loadPracticeHistory()).toHaveLength(1);
  });
});
