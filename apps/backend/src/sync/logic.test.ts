import { describe, it, expect } from "vitest";
import {
  parseTrialResultPushes,
  isBetterLevelRecord,
  evaluateTrialResult,
  deriveLevelRuns,
} from "./logic.js";

const validTrial = {
  id: "trial-1",
  levelNumber: 3,
  categoryCodename: "1d+1d",
  clientCorrect: true,
  clientTimeExceeded: false,
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "9", t: 100 }, { key: "2", t: 340 }],
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  streakAtSubmit: 2,
  hintsAvailableAtStart: 3,
  levelRunId: "run-abc",
};

describe("parseTrialResultPushes", () => {
  it("accepts a well-formed body", () => {
    expect(parseTrialResultPushes({ trials: [validTrial] })).toEqual([validTrial]);
  });

  it("accepts an empty trials array", () => {
    expect(parseTrialResultPushes({ trials: [] })).toEqual([]);
  });

  it("rejects a body with no trials field", () => {
    expect(parseTrialResultPushes({})).toBeNull();
  });

  it("rejects a non-array trials field", () => {
    expect(parseTrialResultPushes({ trials: "nope" })).toBeNull();
  });

  it("rejects a trial missing a required field", () => {
    const { timeTaken: _timeTaken, ...incomplete } = validTrial;
    expect(parseTrialResultPushes({ trials: [incomplete] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed id", () => {
    expect(parseTrialResultPushes({ trials: [{ ...validTrial, id: 123 }] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed clientCorrect", () => {
    expect(parseTrialResultPushes({ trials: [{ ...validTrial, clientCorrect: "yes" }] })).toBeNull();
  });

  it("accepts an empty keystrokes array", () => {
    const trial = { ...validTrial, keystrokes: [] };
    expect(parseTrialResultPushes({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a malformed keystroke", () => {
    const trial = { ...validTrial, keystrokes: [{ key: "9", t: "not-a-number" }] };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-array keystrokes field", () => {
    const trial = { ...validTrial, keystrokes: "nope" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("accepts a null answer (a timed-out trial)", () => {
    const trial = { ...validTrial, answer: null };
    expect(parseTrialResultPushes({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a non-array operands field", () => {
    const trial = { ...validTrial, operands: "nope" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-numeric operand", () => {
    const trial = { ...validTrial, operands: [4, "5"] };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed answer", () => {
    const trial = { ...validTrial, answer: "9" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintShown", () => {
    const trial = { ...validTrial, hintShown: "yes" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed streakAtSubmit", () => {
    const trial = { ...validTrial, streakAtSubmit: "2" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintsAvailableAtStart", () => {
    const trial = { ...validTrial, hintsAvailableAtStart: "3" };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed levelRunId", () => {
    const trial = { ...validTrial, levelRunId: 123 };
    expect(parseTrialResultPushes({ trials: [trial] })).toBeNull();
  });

  it("rejects null and non-object bodies", () => {
    expect(parseTrialResultPushes(null)).toBeNull();
    expect(parseTrialResultPushes("nope")).toBeNull();
  });
});

describe("evaluateTrialResult", () => {
  it("confirms a client claim that matches the server's own recomputation", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.id).toBe("trial-1");
    expect(evaluated.correct).toBe(true);
    expect(evaluated.timeExceeded).toBe(false);
    expect(evaluated.clientCorrect).toBe(true);
    expect(evaluated.clientTimeExceeded).toBe(false);
  });

  it("passes hintShown, streakAtSubmit, hintsAvailableAtStart, and levelRunId through unchanged", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.hintShown).toBe(false);
    expect(evaluated.streakAtSubmit).toBe(2);
    expect(evaluated.hintsAvailableAtStart).toBe(3);
    expect(evaluated.levelRunId).toBe("run-abc");
  });

  it("overrides a client claim that disagrees with the server's own recomputation, keeping the claim for auditing", () => {
    // operands say 4 + 5 = 9, but the client claims a wrong answer was correct
    const trial = { ...validTrial, answer: 100, clientCorrect: true };
    const evaluated = evaluateTrialResult(trial);

    expect(evaluated.correct).toBe(false); // server-computed wins
    expect(evaluated.clientCorrect).toBe(true); // original claim preserved for auditing
  });
});

function evaluatedTrial(overrides: Partial<ReturnType<typeof evaluateTrialResult>> = {}) {
  return {
    id: `trial-${Math.random().toString(36).slice(2)}`,
    levelNumber: 4,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    clientCorrect: true,
    clientTimeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    levelRunId: "run-1",
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
    expect(summary.totalTime).toBe(6000); // sums every trial, not just correct-in-time ones
    expect(summary.stars).toBe(0); // 2 correct-in-time < LEVEL_COMPLETE_THRESHOLD (15)
    expect(summary.levelCompleted).toBe(false);
  });

  it("bases stars/completion on the server-computed correct/timeExceeded, not the client's claim", () => {
    const trials = Array.from({ length: 20 }, () =>
      evaluatedTrial({ correct: false, clientCorrect: true }), // client claims correct; server disagrees
    );

    const [summary] = deriveLevelRuns(trials);
    expect(summary.stars).toBe(0);
    expect(summary.levelCompleted).toBe(false);
  });

  it("marks a run completed once correct-in-time trials reach the threshold", () => {
    const trials = Array.from({ length: 20 }, () => evaluatedTrial());
    const [summary] = deriveLevelRuns(trials);
    expect(summary.levelCompleted).toBe(true);
    expect(summary.stars).toBe(3);
  });

  it("groups a mixed batch by levelRunId, scoring each run independently", () => {
    const trials = [
      ...Array.from({ length: 20 }, () => evaluatedTrial({ levelRunId: "run-1", levelNumber: 1 })), // 20 correct-in-time → 3 stars
      evaluatedTrial({ levelRunId: "run-2", levelNumber: 2, correct: false }), // 0 correct-in-time → 0 stars
    ];

    const summaries = deriveLevelRuns(trials);
    expect(summaries.find((s) => s.levelRunId === "run-1")).toMatchObject({ levelNumber: 1, stars: 3 });
    expect(summaries.find((s) => s.levelRunId === "run-2")).toMatchObject({ levelNumber: 2, stars: 0 });
  });

  it("returns an empty array for no trials", () => {
    expect(deriveLevelRuns([])).toEqual([]);
  });
});

describe("isBetterLevelRecord", () => {
  it("accepts anything when there's no existing record", () => {
    expect(isBetterLevelRecord({ stars: 0, totalTime: 999_999 }, null)).toBe(true);
  });

  it("accepts more stars", () => {
    expect(isBetterLevelRecord({ stars: 2, totalTime: 20000 }, { stars: 1, totalTime: 10000 })).toBe(true);
  });

  it("rejects fewer stars even with a better time", () => {
    expect(isBetterLevelRecord({ stars: 1, totalTime: 5000 }, { stars: 2, totalTime: 20000 })).toBe(false);
  });

  it("accepts the same stars with a better time", () => {
    expect(isBetterLevelRecord({ stars: 2, totalTime: 9000 }, { stars: 2, totalTime: 10000 })).toBe(true);
  });

  it("rejects the same stars with a worse time", () => {
    expect(isBetterLevelRecord({ stars: 2, totalTime: 12000 }, { stars: 2, totalTime: 10000 })).toBe(false);
  });
});
