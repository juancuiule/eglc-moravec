import { describe, it, expect, vi } from "vitest";
import { buildPersistedTrials } from "./trialHistory";
import { Addition, Multiplication } from "engine";
import { LEVELS } from "../LEVELS";
import type { TrialResult } from "../game/index";

const config = { levelNumber: 7, level: LEVELS["1"], totalTrials: 20 };

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
    const [persisted] = buildPersistedTrials(config, [result]);

    expect(persisted.levelNumber).toBe(7);
    expect(persisted.categoryCodename).toBe(result.operation.categoryCodename());
    expect(persisted.correct).toBe(true);
    expect(persisted.timeExceeded).toBe(false);
    expect(persisted.timeTaken).toBe(1200);
    expect(persisted.keystrokes).toBe(result.keystrokes);
    expect(persisted.hintShown).toBe(false);
    expect(persisted.streakAtSubmit).toBe(0);
    expect(persisted.hintsAvailableAtStart).toBe(3);
    expect(persisted.playedAt).toBe("2026-01-01T00:00:00.000Z");

    vi.useRealTimers();
  });

  it("carries the category codename from each result's own operation", () => {
    const additionOp = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
    const multOp = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });

    const persisted = buildPersistedTrials(config, [
      makeResult({ operation: additionOp }),
      makeResult({ operation: multOp }),
    ]);

    expect(persisted[0].categoryCodename).toBe("1d+1d");
    expect(persisted[1].categoryCodename).toBe("1dx1d");
  });

  it("returns an empty array for no results", () => {
    expect(buildPersistedTrials(config, [])).toEqual([]);
  });

  it("assigns each trial its own timestamp, working backward by timeTaken from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

    const persisted = buildPersistedTrials(config, [
      makeResult({ timeTaken: 1000 }),
      makeResult({ timeTaken: 2000 }),
      makeResult({ timeTaken: 3000 }),
    ]);

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
