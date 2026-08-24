import { describe, it, expect } from "vitest";
import {
  parseTrialResults,
  isBetterLevelRecord,
  evaluateTrialResult,
  deriveLevelStats,
} from "./logic.js";

const validTrial = {
  levelNumber: 3,
  categoryCodename: "1d+1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "9", t: 100 }, { key: "2", t: 340 }],
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  streakAtSubmit: 2,
  hintsAvailableAtStart: 3,
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
    expect(parseTrialResults({ trials: [{ ...validTrial, correct: "yes" }] })).toBeNull();
  });

  it("accepts an empty keystrokes array", () => {
    const trial = { ...validTrial, keystrokes: [] };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a malformed keystroke", () => {
    const trial = { ...validTrial, keystrokes: [{ key: "9", t: "not-a-number" }] };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-array keystrokes field", () => {
    const trial = { ...validTrial, keystrokes: "nope" };
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

  it("rejects a trial with a wrong-typed streakAtSubmit", () => {
    const trial = { ...validTrial, streakAtSubmit: "2" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintsAvailableAtStart", () => {
    const trial = { ...validTrial, hintsAvailableAtStart: "3" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects null and non-object bodies", () => {
    expect(parseTrialResults(null)).toBeNull();
    expect(parseTrialResults("nope")).toBeNull();
  });
});

describe("evaluateTrialResult", () => {
  it("confirms a client claim that matches the server's own recomputation", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.correct).toBe(true);
    expect(evaluated.timeExceeded).toBe(false);
    expect(evaluated.clientCorrect).toBe(true);
    expect(evaluated.clientTimeExceeded).toBe(false);
  });

  it("passes hintShown, streakAtSubmit, and hintsAvailableAtStart through unchanged", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.hintShown).toBe(false);
    expect(evaluated.streakAtSubmit).toBe(2);
    expect(evaluated.hintsAvailableAtStart).toBe(3);
  });

  it("overrides a client claim that disagrees with the server's own recomputation, keeping the claim for auditing", () => {
    // operands say 4 + 5 = 9, but the client claims a wrong answer was correct
    const trial = { ...validTrial, answer: 100, correct: true };
    const evaluated = evaluateTrialResult(trial);

    expect(evaluated.correct).toBe(false); // server-computed wins
    expect(evaluated.clientCorrect).toBe(true); // original claim preserved for auditing
  });
});

function evaluatedTrial(overrides: Partial<ReturnType<typeof evaluateTrialResult>> = {}) {
  return {
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
    ...overrides,
  };
}

describe("deriveLevelStats", () => {
  it("derives stars/totalTime for a single level from its trial batch", () => {
    const trials = [
      evaluatedTrial({ timeTaken: 1000 }),
      evaluatedTrial({ timeTaken: 2000 }),
      evaluatedTrial({ correct: false, timeTaken: 3000 }),
    ];

    const [summary] = deriveLevelStats(trials);
    expect(summary.levelNumber).toBe(4);
    expect(summary.totalTime).toBe(6000); // sums every trial, not just correct-in-time ones
    expect(summary.stars).toBe(0); // 2 correct-in-time < LEVEL_COMPLETE_THRESHOLD (15)
  });

  it("bases stars on the server-computed correct/timeExceeded, not the client's claim", () => {
    const trials = Array.from({ length: 20 }, () =>
      evaluatedTrial({ correct: false, clientCorrect: true }), // client claims correct; server disagrees
    );

    const [summary] = deriveLevelStats(trials);
    expect(summary.stars).toBe(0);
  });

  it("groups a mixed batch by levelNumber, scoring each independently", () => {
    const trials = [
      ...Array.from({ length: 20 }, () => evaluatedTrial({ levelNumber: 1 })), // 20 correct-in-time → 3 stars
      evaluatedTrial({ levelNumber: 2, correct: false }), // 0 correct-in-time → 0 stars
    ];

    const summaries = deriveLevelStats(trials);
    expect(summaries.find((s) => s.levelNumber === 1)?.stars).toBe(3);
    expect(summaries.find((s) => s.levelNumber === 2)?.stars).toBe(0);
  });

  it("returns an empty array for no trials", () => {
    expect(deriveLevelStats([])).toEqual([]);
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
