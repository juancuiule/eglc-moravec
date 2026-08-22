import { describe, it, expect } from "vitest";
import { parseTrialResults, parseLevelStats, isBetterLevelRecord } from "./logic.js";

const validTrial = {
  levelNumber: 3,
  categoryCodename: "1d+1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
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

  it("rejects null and non-object bodies", () => {
    expect(parseTrialResults(null)).toBeNull();
    expect(parseTrialResults("nope")).toBeNull();
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
