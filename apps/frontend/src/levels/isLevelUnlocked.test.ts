import { describe, it, expect } from "vitest";
import { isLevelUnlocked } from "./isLevelUnlocked";

describe("isLevelUnlocked", () => {
  it("level 1 is always unlocked", () => {
    expect(isLevelUnlocked(1, {})).toBe(true);
  });

  it("a level is locked when the previous one has no record", () => {
    expect(isLevelUnlocked(2, {})).toBe(false);
  });

  it("a level is locked when the previous one has zero stars", () => {
    const stats = { "1": { stars: 0 as const, totalTime: 5000, completedAt: "x" } };
    expect(isLevelUnlocked(2, stats)).toBe(false);
  });

  it("a level unlocks once the previous one has at least one star", () => {
    const stats = { "1": { stars: 1 as const, totalTime: 5000, completedAt: "x" } };
    expect(isLevelUnlocked(2, stats)).toBe(true);
  });
});
