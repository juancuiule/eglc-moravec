import { describe, it, expect } from "vitest";
import {
  parseTrialResults,
  parseLevelStats,
  isBetterLevelRecord,
  evaluateTrialResult,
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

  it("overrides a client claim that disagrees with the server's own recomputation, keeping the claim for auditing", () => {
    // operands say 4 + 5 = 9, but the client claims a wrong answer was correct
    const trial = { ...validTrial, answer: 100, correct: true };
    const evaluated = evaluateTrialResult(trial);

    expect(evaluated.correct).toBe(false); // server-computed wins
    expect(evaluated.clientCorrect).toBe(true); // original claim preserved for auditing
  });
});

describe("parseLevelStats", () => {
  it("accepts a well-formed body", () => {
    expect(parseLevelStats({ levelNumber: 4, stars: 2, totalTime: 30000 })).toEqual({
      levelNumber: 4,
      stars: 2,
      totalTime: 30000,
    });
  });

  it("rejects an out-of-range stars value", () => {
    expect(parseLevelStats({ levelNumber: 4, stars: 4, totalTime: 30000 })).toBeNull();
  });

  it("rejects a missing field", () => {
    expect(parseLevelStats({ levelNumber: 4, stars: 2 })).toBeNull();
  });

  it("rejects a non-object body", () => {
    expect(parseLevelStats(null)).toBeNull();
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
