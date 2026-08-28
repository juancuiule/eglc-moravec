import { describe, it, expect, beforeEach } from "vitest";
import { store } from "./store";
import {
  loadLevelStats,
  saveLevelStats,
  updateLevelRecord,
  mergeRemoteLevelStats,
  isLevelUnlocked,
} from "./levelStats";

beforeEach(() => {
  store.delTables();
});

describe("loadLevelStats", () => {
  it("returns empty object when nothing stored", () => {
    expect(loadLevelStats()).toEqual({});
  });

  it("returns stored stats", () => {
    store.setRow("levelStats", "1", { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
    expect(loadLevelStats()).toEqual({
      "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" },
    });
  });
});

describe("saveLevelStats", () => {
  it("persists stats to the store", () => {
    const data = { "5": { stars: 2 as const, totalTime: 12000, completedAt: "2025-01-01T00:00:00.000Z" } };
    saveLevelStats(data);
    expect(store.getRow("levelStats", "5")).toEqual(data["5"]);
  });
});

describe("updateLevelRecord", () => {
  it("saves a record when none exists", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 10000 });
    const stats = loadLevelStats();
    expect(stats["1"]?.stars).toBe(2);
    expect(stats["1"]?.totalTime).toBe(10000);
    expect(stats["1"]?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("overwrites when new run has more stars", () => {
    updateLevelRecord(1, { stars: 1, totalTime: 10000 });
    updateLevelRecord(1, { stars: 3, totalTime: 20000 });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("overwrites when same stars but less time", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 10000 });
    updateLevelRecord(1, { stars: 2, totalTime: 8000 });
    expect(loadLevelStats()["1"]?.totalTime).toBe(8000);
  });

  it("does not overwrite when fewer stars", () => {
    updateLevelRecord(1, { stars: 3, totalTime: 10000 });
    updateLevelRecord(1, { stars: 1, totalTime: 5000 });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("does not overwrite when same stars but more time", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 8000 });
    updateLevelRecord(1, { stars: 2, totalTime: 12000 });
    expect(loadLevelStats()["1"]?.totalTime).toBe(8000);
  });

  it("returns whether it was a new record", () => {
    expect(updateLevelRecord(1, { stars: 2, totalTime: 10000 })).toBe(true);
    expect(updateLevelRecord(1, { stars: 1, totalTime: 5000 })).toBe(false);
    expect(updateLevelRecord(1, { stars: 2, totalTime: 5000 })).toBe(true);
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
    updateLevelRecord(1, { stars: 3, totalTime: 5000 });
    mergeRemoteLevelStats({ "1": { stars: 1, totalTime: 20000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("upgrades a worse local record", () => {
    updateLevelRecord(1, { stars: 1, totalTime: 20000 });
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
