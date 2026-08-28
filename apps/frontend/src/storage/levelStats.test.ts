import { describe, it, expect, beforeEach } from "vitest";
import {
  loadLevelStats,
  saveLevelStats,
  updateLevelRecord,
  mergeRemoteLevelStats,
  isLevelUnlocked,
} from "./levelStats";
import { resetLocalStore, localStore } from "./store";

beforeEach(() => {
  resetLocalStore();
});

describe("loadLevelStats", () => {
  it("returns empty object when nothing recorded", () => {
    expect(loadLevelStats()).toEqual({});
  });

  it("derives stats from whatever levelRuns rows exist", () => {
    updateLevelRecord(1, "run-1", { stars: 3, totalTime: 5000, levelCompleted: true });
    expect(loadLevelStats()["1"]).toMatchObject({ stars: 3, totalTime: 5000 });
  });
});

describe("saveLevelStats", () => {
  it("seeds a levelRuns row visible through loadLevelStats", () => {
    saveLevelStats({ "5": { stars: 2, totalTime: 12000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["5"]).toEqual({
      stars: 2,
      totalTime: 12000,
      completedAt: "2025-01-01T00:00:00.000Z",
    });
  });
});

describe("updateLevelRecord", () => {
  it("saves a record when none exists", () => {
    updateLevelRecord(1, "run-1", { stars: 2, totalTime: 10000, levelCompleted: false });
    const stats = loadLevelStats();
    expect(stats["1"]?.stars).toBe(2);
    expect(stats["1"]?.totalTime).toBe(10000);
    expect(stats["1"]?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("derives the record as the best across runs when a new run has more stars", () => {
    updateLevelRecord(1, "run-1", { stars: 1, totalTime: 10000, levelCompleted: false });
    updateLevelRecord(1, "run-2", { stars: 3, totalTime: 20000, levelCompleted: true });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("derives the record as the best when same stars but less time", () => {
    updateLevelRecord(1, "run-1", { stars: 2, totalTime: 10000, levelCompleted: false });
    updateLevelRecord(1, "run-2", { stars: 2, totalTime: 8000, levelCompleted: false });
    expect(loadLevelStats()["1"]?.totalTime).toBe(8000);
  });

  it("keeps a worse run's stats out of the derived record", () => {
    updateLevelRecord(1, "run-1", { stars: 3, totalTime: 10000, levelCompleted: true });
    updateLevelRecord(1, "run-2", { stars: 1, totalTime: 5000, levelCompleted: false });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("keeps every run in the table, not just the best — mirrors the backend's level_runs", () => {
    updateLevelRecord(1, "run-1", { stars: 3, totalTime: 10000, levelCompleted: true });
    updateLevelRecord(1, "run-2", { stars: 1, totalTime: 5000, levelCompleted: false });
    expect(localStore.getRowCount("levelRuns")).toBe(2);
  });

  it("stores the row keyed by the given runId — the same id the backend will derive for the same run", () => {
    updateLevelRecord(1, "run-abc", { stars: 2, totalTime: 8000, levelCompleted: false });
    expect(localStore.getRow("levelRuns", "run-abc")).toMatchObject({ levelNumber: 1, stars: 2 });
  });

  it("returns whether it was a new record", () => {
    expect(updateLevelRecord(1, "run-1", { stars: 2, totalTime: 10000, levelCompleted: false })).toBe(true);
    expect(updateLevelRecord(1, "run-2", { stars: 1, totalTime: 5000, levelCompleted: false })).toBe(false);
    expect(updateLevelRecord(1, "run-3", { stars: 2, totalTime: 5000, levelCompleted: false })).toBe(true);
  });
});

describe("mergeRemoteLevelStats", () => {
  it("adopts remote records when nothing local exists", () => {
    mergeRemoteLevelStats({
      "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" },
      "2": { stars: 1, totalTime: 9000, completedAt: "2025-01-01T00:00:00.000Z" },
    });
    const stats = loadLevelStats();
    expect(stats["1"]?.stars).toBe(3);
    expect(stats["2"]?.stars).toBe(1);
  });

  it("never downgrades a better local record", () => {
    updateLevelRecord(1, "run-1", { stars: 3, totalTime: 5000, levelCompleted: true });
    mergeRemoteLevelStats({ "1": { stars: 1, totalTime: 20000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("upgrades a worse local record", () => {
    updateLevelRecord(1, "run-1", { stars: 1, totalTime: 20000, levelCompleted: false });
    mergeRemoteLevelStats({ "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });
});

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
