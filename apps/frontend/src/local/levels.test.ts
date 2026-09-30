import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: { fetchAllLevels: vi.fn<(...args: unknown[]) => Promise<unknown>>() },
}));

vi.mock("../api/Api", () => ({ Api: api }));

import { localStore } from "./store";
import {
  LEVEL_NUMBERS_VALUE,
  LEVELS_TABLE,
  localLevelMix,
  localLevelNumbers,
  refreshLevelCatalog,
} from "./levels";

beforeEach(() => {
  vi.clearAllMocks();
  localStore.delTable(LEVELS_TABLE);
  localStore.delValue(LEVEL_NUMBERS_VALUE);
  localStore.setValue("hydrated", true);
  api.fetchAllLevels.mockResolvedValue([
    { levelNumber: 1, mix: { "1d+1d": 50, "1dx1d": 50 } },
    { levelNumber: 2, mix: { "2d+2d": 100 } },
  ]);
});

describe("refreshLevelCatalog", () => {
  it("writes every level's mix and the number list from the server answer", async () => {
    await refreshLevelCatalog();

    expect(localLevelMix(1)).toEqual({ "1d+1d": 50, "1dx1d": 50 });
    expect(localLevelMix(2)).toEqual({ "2d+2d": 100 });
    expect(localLevelNumbers()).toEqual([1, 2]);
  });

  it("keeps mixes for numbers dropped from the catalog — a cache, not a mirror", async () => {
    await refreshLevelCatalog();
    expect(localLevelMix(2)).not.toBeNull();

    // Level 2 is gone from the catalog — its row stays (history references
    // it) but the number list tracks the server wholesale.
    api.fetchAllLevels.mockResolvedValue([
      { levelNumber: 1, mix: { "1d+1d": 50, "1dx1d": 50 } },
    ]);
    await refreshLevelCatalog();

    expect(localLevelNumbers()).toEqual([1]);
    expect(localLevelMix(2)).toEqual({ "2d+2d": 100 });
  });

  it("leaves the existing snapshot standing when the fetch fails", async () => {
    await refreshLevelCatalog();
    api.fetchAllLevels.mockRejectedValue(new Error("offline"));

    await expect(refreshLevelCatalog()).resolves.toBeUndefined();
    expect(localLevelNumbers()).toEqual([1, 2]);
    expect(localLevelMix(1)).not.toBeNull();
  });

  it("a stale in-flight refresh cannot overwrite a newer snapshot", async () => {
    let resolveFirst!: (v: unknown) => void;
    api.fetchAllLevels.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = r)),
    );
    const first = refreshLevelCatalog();

    // The newer refresh answers first and writes [1,2].
    api.fetchAllLevels.mockResolvedValueOnce([
      { levelNumber: 1, mix: { "1d+1d": 100 } },
      { levelNumber: 2, mix: { "2d+2d": 100 } },
    ]);
    await refreshLevelCatalog();
    expect(localLevelNumbers()).toEqual([1, 2]);

    // The older response lands last — it must be discarded, not written.
    resolveFirst([{ levelNumber: 1, mix: { "1d+1d": 100 } }]);
    await first;
    expect(localLevelNumbers()).toEqual([1, 2]);
  });
});

describe("localLevelMix", () => {
  it("returns null for a never-cached level", () => {
    expect(localLevelMix(9)).toBeNull();
  });

  it("reads corrupt or unsupported cells as not-cached instead of crashing later", async () => {
    localStore.setRow(LEVELS_TABLE, "5", { mix: "{not json" });
    expect(localLevelMix(5)).toBeNull();

    localStore.setRow(LEVELS_TABLE, "6", {
      mix: JSON.stringify({ "bogus-category": 100 }),
    });
    expect(localLevelMix(6)).toBeNull();

    localStore.setRow(LEVELS_TABLE, "7", {
      mix: JSON.stringify({ "1d+1d": -5 }),
    });
    expect(localLevelMix(7)).toBeNull();
  });

  it("rejects a mix whose weights sum to zero — it would throw mid-play", () => {
    localStore.setRow(LEVELS_TABLE, "8", {
      mix: JSON.stringify({ "1d+1d": 0, "1dx1d": 0 }),
    });
    expect(localLevelMix(8)).toBeNull();
  });
});

describe("localLevelNumbers", () => {
  it("returns null before any snapshot and after corrupt data", () => {
    expect(localLevelNumbers()).toBeNull();
    localStore.setValue(LEVEL_NUMBERS_VALUE, "not json");
    expect(localLevelNumbers()).toBeNull();
    localStore.setValue(LEVEL_NUMBERS_VALUE, '["a",1]');
    expect(localLevelNumbers()).toBeNull();
  });
});
