import { describe, it, expect } from "vitest";
import {
  starsForScore,
  LEVEL_COMPLETE_THRESHOLD,
  TOTAL_LEVELS,
  TRIALS_PER_LEVEL,
  isBetterLevelRecord,
} from "./levelScoring";

describe("starsForScore", () => {
  it("returns 0 for fewer than 15", () => {
    expect(starsForScore(0)).toBe(0);
    expect(starsForScore(14)).toBe(0);
  });

  it("returns 1 for 15–16", () => {
    expect(starsForScore(15)).toBe(1);
    expect(starsForScore(16)).toBe(1);
  });

  it("returns 2 for 17–19", () => {
    expect(starsForScore(17)).toBe(2);
    expect(starsForScore(19)).toBe(2);
  });

  it("returns 3 for 20", () => {
    expect(starsForScore(20)).toBe(3);
  });
});

describe("LEVEL_COMPLETE_THRESHOLD", () => {
  it("is 15", () => {
    expect(LEVEL_COMPLETE_THRESHOLD).toBe(15);
  });
});

describe("TOTAL_LEVELS", () => {
  it("is 150", () => {
    expect(TOTAL_LEVELS).toBe(150);
  });
});

describe("TRIALS_PER_LEVEL", () => {
  it("is 20", () => {
    expect(TRIALS_PER_LEVEL).toBe(20);
  });
});

describe("isBetterLevelRecord", () => {
  it("accepts anything when there's no existing record", () => {
    expect(isBetterLevelRecord({ stars: 0, totalTime: 999_999 }, null)).toBe(true);
    expect(isBetterLevelRecord({ stars: 0, totalTime: 999_999 }, undefined)).toBe(true);
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
