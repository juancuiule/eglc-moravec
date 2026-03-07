import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadLevelStats,
  saveLevelStats,
  updateLevelRecord,
} from "./levelStats";

const STORAGE_KEY = "moravec:levelStats";

// Minimal localStorage mock
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k in store) delete store[k]; },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
});

describe("loadLevelStats", () => {
  it("returns empty object when nothing stored", () => {
    expect(loadLevelStats()).toEqual({});
  });

  it("returns parsed stats when present", () => {
    const data = { "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" } };
    store[STORAGE_KEY] = JSON.stringify(data);
    expect(loadLevelStats()).toEqual(data);
  });

  it("returns empty object on malformed JSON", () => {
    store[STORAGE_KEY] = "not-json";
    expect(loadLevelStats()).toEqual({});
  });
});

describe("saveLevelStats", () => {
  it("persists stats to localStorage", () => {
    const data = { "5": { stars: 2 as const, totalTime: 12000, completedAt: "2025-01-01T00:00:00.000Z" } };
    saveLevelStats(data);
    expect(JSON.parse(store[STORAGE_KEY])).toEqual(data);
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
});
