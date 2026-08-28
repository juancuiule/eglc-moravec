import { describe, it, expect } from "vitest";
import { openDb } from "../db.js";
import { getLevelNumbers, getLevelMix, getAllLevels } from "./repo.js";

describe("getLevelNumbers", () => {
  it("returns every seeded level number, in order", () => {
    const db = openDb(":memory:");
    const numbers = getLevelNumbers(db);
    expect(numbers).toHaveLength(150);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(150);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });
});

describe("getLevelMix", () => {
  it("returns the parsed mix for a known level", () => {
    const db = openDb(":memory:");
    expect(getLevelMix(db, 1)).toEqual({ "1d+1d": 50, "1dx1d": 50 });
  });

  it("returns null for an unknown level number", () => {
    const db = openDb(":memory:");
    expect(getLevelMix(db, 99999)).toBeNull();
  });
});

describe("getAllLevels", () => {
  it("returns every seeded level with its parsed mix, in order", () => {
    const db = openDb(":memory:");
    const levels = getAllLevels(db);

    expect(levels).toHaveLength(150);
    expect(levels[0]).toEqual({ levelNumber: 1, mix: { "1d+1d": 50, "1dx1d": 50 } });
    expect(levels.map((l) => l.levelNumber)).toEqual(
      [...levels.map((l) => l.levelNumber)].sort((a, b) => a - b),
    );
  });
});
