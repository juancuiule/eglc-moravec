import { describe, it, expect } from "vitest";
import { starsForScore, LEVEL_COMPLETE_THRESHOLD } from "./levelScoring";

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
