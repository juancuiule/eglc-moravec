import { describe, it, expect } from "vitest";
import { computeStats, ALL_CATEGORIES } from "./computeStats";
import type { PersistedTrial } from "../storage/trialHistory";

function trial(
  categoryCodename: string,
  correct: boolean,
  timeExceeded = false,
  timeTaken = 3000,
): PersistedTrial {
  return {
    levelNumber: 1,
    categoryCodename,
    correct,
    timeExceeded,
    timeTaken,
    playedAt: new Date().toISOString(),
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
  };
}

describe("computeStats", () => {
  it("returns a row for every known category", () => {
    const stats = computeStats([]);
    expect(stats.map((s) => s.codename)).toEqual(ALL_CATEGORIES);
  });

  it("rows with no attempts have total=0 and effectiveness=0", () => {
    const stats = computeStats([]);
    for (const row of stats) {
      expect(row.total).toBe(0);
      expect(row.effectiveness).toBe(0);
      expect(row.avgTimeMs).toBeNull();
    }
  });

  it("counts correct-in-time correctly", () => {
    const trials = [
      trial("1d+1d", true, false, 2000),
      trial("1d+1d", true, false, 4000),
      trial("1d+1d", false, false),
      trial("1d+1d", true, true, 8000), // correct but late — doesn't count
    ];
    const stats = computeStats(trials);
    const row = stats.find((s) => s.codename === "1d+1d")!;
    expect(row.total).toBe(4);
    expect(row.correctInTime).toBe(2);
    expect(row.effectiveness).toBeCloseTo(0.5);
    expect(row.avgTimeMs).toBeCloseTo(3000);
  });

  it("avgTimeMs is null when no correct-in-time trials", () => {
    const trials = [trial("1dx1d", false), trial("1dx1d", true, true)];
    const stats = computeStats(trials);
    const row = stats.find((s) => s.codename === "1dx1d")!;
    expect(row.avgTimeMs).toBeNull();
  });

  it("includes unknown categories from history at the end", () => {
    const trials = [trial("9dx9d", true)];
    const stats = computeStats(trials);
    const last = stats[stats.length - 1];
    expect(last.codename).toBe("9dx9d");
  });
});
