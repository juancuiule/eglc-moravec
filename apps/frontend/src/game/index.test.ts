import { beforeEach, describe, expect, it, vi } from "vitest";
import { Addition, TRIALS_PER_LEVEL, type TrialResult } from "engine";

// ─── Level's own policy: pickNext (dedup), isComplete (cutoff),
// buildTerminalState (scoring), initialHintsRemaining ──────────────────

vi.mock("../level", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../level")>();
  return { ...actual, createRandomOperation: vi.fn() };
});

import { createRandomOperation, type Level } from "../level";
import {
  createGameStore,
  HINTS_PER_LEVEL,
  policy,
  type GameConfig,
} from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

const level1: Level = { "1d+1d": 50, "1dx1d": 50 };

function makeConfig(
  overrides: Partial<{ levelNumber: number; totalTrials: number }> = {},
): GameConfig {
  return {
    levelNumber: overrides.levelNumber ?? 1,
    level: level1,
    totalTrials: overrides.totalTrials ?? TRIALS_PER_LEVEL,
  };
}

const additionCategory = {
  type: "addition" as const,
  codename: "1d+1d" as const,
  lDigits: 1,
  rDigits: 1,
};

function op(left: number, right: number) {
  return new Addition(left, right, additionCategory);
}

function evaluatedResult(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    operation: op(1, 1),
    answer: 2,
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    hintShown: false,
    ...overrides,
  };
}

describe("policy.initialHintsRemaining", () => {
  it("is HINTS_PER_LEVEL (3)", () => {
    expect(policy.initialHintsRemaining(makeConfig())).toBe(HINTS_PER_LEVEL);
  });
});

describe("policy.isComplete", () => {
  it("is false while results are fewer than totalTrials", () => {
    const config = makeConfig({ totalTrials: 20 });
    const results = Array.from({ length: 19 }, () => evaluatedResult());
    expect(policy.isComplete(results, config)).toBe(false);
  });

  it("is true once results reach totalTrials", () => {
    const config = makeConfig({ totalTrials: 20 });
    const results = Array.from({ length: 20 }, () => evaluatedResult());
    expect(policy.isComplete(results, config)).toBe(true);
  });
});

describe("policy.buildTerminalState", () => {
  it("computes correctCount, levelCompleted, and stars from the results batch", () => {
    const results = [
      ...Array.from({ length: 15 }, () => evaluatedResult({ correct: true })),
      ...Array.from({ length: 5 }, () => evaluatedResult({ correct: false })),
    ];
    const finished = policy.buildTerminalState(
      results,
      makeConfig(),
      "run-abc",
    );
    expect(finished.type).toBe("finished");
    expect(finished.correctCount).toBe(15);
    expect(finished.levelCompleted).toBe(true); // >= 15 threshold
    expect(finished.stars).toBe(1);
    expect(finished.runId).toBe("run-abc");
  });

  it("levelCompleted is false below the 15-correct threshold", () => {
    const results = [
      ...Array.from({ length: 14 }, () => evaluatedResult({ correct: true })),
      ...Array.from({ length: 6 }, () => evaluatedResult({ correct: false })),
    ];
    const finished = policy.buildTerminalState(
      results,
      makeConfig(),
      "run-abc",
    );
    expect(finished.levelCompleted).toBe(false);
    expect(finished.stars).toBe(0);
  });
});

describe("policy.pickNext", () => {
  it("skips an already-seen operation when a fresh one is available", () => {
    const seen = op(1, 1);
    const fresh = op(2, 2);
    vi.mocked(createRandomOperation)
      .mockReturnValueOnce(seen) // collides with what's already seen — skipped
      .mockReturnValueOnce(fresh); // not seen — returned

    const { operation, pickState } = policy.pickNext(
      makeConfig(),
      new Set([seen.humanReadable()]),
    );

    expect(operation.humanReadable()).toBe(fresh.humanReadable());
    expect(pickState.has(fresh.humanReadable())).toBe(true);
  });

  it("falls back to a repeat after 50 attempts if nothing fresh turns up", () => {
    const onlyOption = op(1, 1);
    vi.mocked(createRandomOperation).mockReturnValue(onlyOption);

    const { operation } = policy.pickNext(
      makeConfig(),
      new Set([onlyOption.humanReadable()]),
    );

    // Doesn't hang or throw — gives up dedup and returns the only option.
    expect(operation.humanReadable()).toBe(onlyOption.humanReadable());
    expect(createRandomOperation).toHaveBeenCalledTimes(51); // 50 in the loop + 1 fallback call
  });
});

// ─── Wiring smoke test — the shared machine itself is covered by
// trialSession/index.test.ts; this just proves createGameStore() plugs
// Level's policy into it correctly ───────────────────────────────────

describe("createGameStore", () => {
  beforeEach(() => {
    vi.mocked(createRandomOperation).mockImplementation(() => op(1, 1));
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("plays a Level from start to finished, then starts fresh with a new runId", () => {
    const store = createGameStore();
    store.getState().start(makeConfig({ totalTrials: 1 }));

    const playing = store.getState().state;
    if (playing.type !== "playing") throw new Error();
    store.getState().submitAnswer(playing.currentOperation.result());
    store.getState().advance();

    const finished = store.getState().state;
    if (finished.type !== "finished") throw new Error();
    expect(finished.correctCount).toBe(1);

    store.getState().start(finished.config);
    const replayed = store.getState().state;
    if (replayed.type !== "playing") throw new Error();
    expect(replayed.runId).not.toBe(finished.runId);
    expect(replayed.hintsRemaining).toBe(HINTS_PER_LEVEL);
  });
});
