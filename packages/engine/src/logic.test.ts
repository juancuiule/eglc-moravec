import { describe, it, expect, vi } from "vitest";
import {
  parseTrialResults,
  evaluateTrialResult,
  deriveLevelRuns,
  toTrialResultInputs,
} from "./logic.js";
import { Addition } from "./operations/operation.js";
import type { TrialResult } from "./trial/engine.js";

const validTrial = {
  id: "50d5a445-85ec-45b0-bdd8-a88424a685ff",
  levelNumber: 3,
  categoryCodename: "1d+1d",
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  runId: "run-abc",
  runType: "level" as const,
};

describe("parseTrialResults", () => {
  it("accepts a well-formed body", () => {
    expect(parseTrialResults({ trials: [validTrial] })).toEqual([validTrial]);
  });

  it("accepts an empty trials array", () => {
    expect(parseTrialResults({ trials: [] })).toEqual([]);
  });

  it("rejects a body with no trials field", () => {
    expect(parseTrialResults({})).toBeNull();
  });

  it("rejects a non-array trials field", () => {
    expect(parseTrialResults({ trials: "nope" })).toBeNull();
  });

  it("rejects a trial missing a required field", () => {
    const { timeTaken: _timeTaken, ...incomplete } = validTrial;
    expect(parseTrialResults({ trials: [incomplete] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed field", () => {
    expect(
      parseTrialResults({ trials: [{ ...validTrial, timeTaken: "yes" }] }),
    ).toBeNull();
  });

  it("rejects a trial with a missing id", () => {
    const { id: _id, ...withoutId } = validTrial;
    expect(parseTrialResults({ trials: [withoutId] })).toBeNull();
  });

  it("rejects a trial with a non-uuid id", () => {
    const trial = { ...validTrial, id: "not-a-uuid" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("accepts a null answer (a timed-out trial)", () => {
    const trial = { ...validTrial, answer: null };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a non-array operands field", () => {
    const trial = { ...validTrial, operands: "nope" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-numeric operand", () => {
    const trial = { ...validTrial, operands: [4, "5"] };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed answer", () => {
    const trial = { ...validTrial, answer: "9" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintShown", () => {
    const trial = { ...validTrial, hintShown: "yes" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed runId", () => {
    const trial = { ...validTrial, runId: 123 };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with an invalid runType", () => {
    const trial = { ...validTrial, runType: "bogus" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("accepts a Practice trial with runType practice and a null levelNumber", () => {
    const trial = {
      ...validTrial,
      runType: "practice" as const,
      levelNumber: null,
    };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a non-number, non-null levelNumber", () => {
    const trial = { ...validTrial, levelNumber: "3" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects null and non-object bodies", () => {
    expect(parseTrialResults(null)).toBeNull();
    expect(parseTrialResults("nope")).toBeNull();
  });
});

describe("evaluateTrialResult", () => {
  it("recomputes correctness/timing from operands/answer/timeTaken via the engine", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.correct).toBe(true);
    expect(evaluated.timeExceeded).toBe(false);
  });

  it("passes id, operands, answer, hintShown, runId, and runType through unchanged", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.id).toBe(validTrial.id);
    expect(evaluated.operands).toEqual([4, 5]);
    expect(evaluated.answer).toBe(9);
    expect(evaluated.hintShown).toBe(false);
    expect(evaluated.runId).toBe("run-abc");
    expect(evaluated.runType).toBe("level");
  });

  it("passes through a null levelNumber for a Practice trial", () => {
    const trial = {
      ...validTrial,
      runType: "practice" as const,
      levelNumber: null,
    };
    expect(evaluateTrialResult(trial).levelNumber).toBeNull();
  });

  it("computes correct: false when the submitted answer doesn't match the operands", () => {
    // operands say 4 + 5 = 9, but the submitted answer is wrong
    const trial = { ...validTrial, answer: 100 };
    const evaluated = evaluateTrialResult(trial);
    expect(evaluated.correct).toBe(false);
  });
});

function evaluatedTrial(
  overrides: Partial<ReturnType<typeof evaluateTrialResult>> = {},
) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    levelNumber: 4,
    categoryCodename: "1d+1d",
    operands: [4, 5],
    answer: 9,
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    hintShown: false,
    runId: "run-1",
    runType: "level" as const,
    ...overrides,
  };
}

describe("deriveLevelRuns", () => {
  it("derives stars/totalTime/levelCompleted for a single run from its trial batch", () => {
    const trials = [
      evaluatedTrial({ timeTaken: 1000 }),
      evaluatedTrial({ timeTaken: 2000 }),
      evaluatedTrial({ correct: false, timeTaken: 3000 }),
    ];

    const [summary] = deriveLevelRuns(trials);
    expect(summary.levelRunId).toBe("run-1");
    expect(summary.levelNumber).toBe(4);
    expect(summary.totalTime).toBe(6000); // sums every trial, not just correct ones
    expect(summary.stars).toBe(0); // 2 correct < LEVEL_COMPLETE_THRESHOLD (15)
    expect(summary.levelCompleted).toBe(false);
  });

  it("marks a run completed once correct trials reach the threshold", () => {
    const trials = Array.from({ length: 20 }, () => evaluatedTrial());
    const [summary] = deriveLevelRuns(trials);
    expect(summary.levelCompleted).toBe(true);
    expect(summary.stars).toBe(3);
  });

  it("counts a correct-but-late trial toward stars — timing no longer gates correctness", () => {
    const trials = Array.from({ length: 20 }, () =>
      evaluatedTrial({ timeExceeded: true }),
    );
    const [summary] = deriveLevelRuns(trials);
    expect(summary.stars).toBe(3);
    expect(summary.levelCompleted).toBe(true);
  });

  it("groups a mixed batch by run id, scoring each run independently", () => {
    const trials = [
      ...Array.from({ length: 20 }, () =>
        evaluatedTrial({ runId: "run-1", levelNumber: 1 }),
      ), // 20 correct → 3 stars
      evaluatedTrial({ runId: "run-2", levelNumber: 2, correct: false }), // 0 correct → 0 stars
    ];

    const summaries = deriveLevelRuns(trials);
    expect(summaries.find((s) => s.levelRunId === "run-1")).toMatchObject({
      levelNumber: 1,
      stars: 3,
    });
    expect(summaries.find((s) => s.levelRunId === "run-2")).toMatchObject({
      levelNumber: 2,
      stars: 0,
    });
  });

  it("takes the latest trial's playedAt within a run", () => {
    const trials = [
      evaluatedTrial({ playedAt: 1000 }),
      evaluatedTrial({ playedAt: 3000 }),
      evaluatedTrial({ playedAt: 2000 }),
    ];
    const [summary] = deriveLevelRuns(trials);
    expect(summary.playedAt).toBe(3000);
  });

  it("returns an empty array for no trials", () => {
    expect(deriveLevelRuns([])).toEqual([]);
  });
});

describe("toTrialResultInputs", () => {
  const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

  function makeResult(overrides: Partial<TrialResult> = {}): TrialResult {
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
      timeTaken: 1200,
      hintShown: false,
      ...overrides,
    };
  }

  it("flattens a Level result into a wire-shaped input", () => {
    const result = makeResult();
    const [input] = toTrialResultInputs(
      [result],
      { runType: "level", levelNumber: 3, runId: "run-abc" },
      NOW,
      () => "11111111-1111-4111-8111-111111111111",
    );

    expect(input).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      runType: "level",
      levelNumber: 3,
      categoryCodename: "1d+1d",
      operands: result.operation.operands(),
      answer: result.answer,
      timeTaken: 1200,
      playedAt: NOW,
      hintShown: false,
      runId: "run-abc",
    });
  });

  it("flattens a Practice result with a null levelNumber", () => {
    const result = makeResult({ timeTaken: 800 });
    const [input] = toTrialResultInputs(
      [result],
      { runType: "practice", levelNumber: null, runId: "practice-run-abc" },
      NOW,
      () => "11111111-1111-4111-8111-111111111111",
    );

    expect(input.runType).toBe("practice");
    expect(input.levelNumber).toBeNull();
    expect(input.runId).toBe("practice-run-abc");
  });

  it("reconstructs playedAt by working backward from `now` across the batch", () => {
    const results = [
      makeResult({ timeTaken: 1000 }),
      makeResult({ timeTaken: 2000 }),
    ];
    const inputs = toTrialResultInputs(
      results,
      { runType: "level", levelNumber: 1, runId: "run-abc" },
      10_000,
      () => crypto.randomUUID(),
    );

    expect(inputs.map((i) => i.playedAt)).toEqual([8000, 10_000]);
  });

  it("generates a fresh id per result via the provided generator", () => {
    const results = [makeResult(), makeResult()];
    const ids = ["id-1", "id-2"];
    let call = 0;
    const inputs = toTrialResultInputs(
      results,
      { runType: "level", levelNumber: 1, runId: "run-abc" },
      NOW,
      () => ids[call++],
    );

    expect(inputs.map((i) => i.id)).toEqual(["id-1", "id-2"]);
  });

  it("defaults the id generator to crypto.randomUUID", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "22222222-2222-4222-8222-222222222222",
    );

    const [input] = toTrialResultInputs(
      [makeResult()],
      { runType: "level", levelNumber: 1, runId: "run-abc" },
      NOW,
    );

    expect(input.id).toBe("22222222-2222-4222-8222-222222222222");
    vi.restoreAllMocks();
  });
});
