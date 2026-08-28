import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetLocalStore } from "./store";

vi.mock("@/api/Api", () => ({
  Api: { fetchLevel: vi.fn(), fetchAllLevels: vi.fn() },
}));

import { Api } from "@/api/Api";
import { loadCachedLevel, cacheLevel, fetchLevelWithFallback, warmLevelCache } from "./levelCache";

beforeEach(() => {
  resetLocalStore();
  vi.mocked(Api.fetchLevel).mockReset();
  vi.mocked(Api.fetchAllLevels).mockReset();
});

describe("cacheLevel / loadCachedLevel", () => {
  it("returns null when nothing has been cached for a level number", () => {
    expect(loadCachedLevel(3)).toBeNull();
  });

  it("round-trips a cached mix", () => {
    cacheLevel(3, { "1d+1d": 50, "1dx1d": 50 });
    expect(loadCachedLevel(3)).toEqual({ "1d+1d": 50, "1dx1d": 50 });
  });
});

describe("fetchLevelWithFallback", () => {
  it("returns the fetched mix and caches it on success", async () => {
    vi.mocked(Api.fetchLevel).mockResolvedValue({ "1d+1d": 100 });

    const result = await fetchLevelWithFallback(5);

    expect(result).toEqual({ "1d+1d": 100 });
    expect(loadCachedLevel(5)).toEqual({ "1d+1d": 100 });
  });

  it("returns null for a genuine 404, without touching the cache", async () => {
    cacheLevel(5, { "1d+1d": 100 });
    vi.mocked(Api.fetchLevel).mockResolvedValue(null);

    const result = await fetchLevelWithFallback(5);

    expect(result).toBeNull();
    expect(loadCachedLevel(5)).toEqual({ "1d+1d": 100 });
  });

  it("falls back to a previously cached mix when the fetch fails", async () => {
    cacheLevel(5, { "1d+1d": 100 });
    vi.mocked(Api.fetchLevel).mockRejectedValue(new Error("network down"));

    const result = await fetchLevelWithFallback(5);

    expect(result).toEqual({ "1d+1d": 100 });
  });

  it("rethrows when the fetch fails and nothing is cached", async () => {
    vi.mocked(Api.fetchLevel).mockRejectedValue(new Error("network down"));

    await expect(fetchLevelWithFallback(5)).rejects.toThrow("network down");
  });
});

describe("warmLevelCache", () => {
  it("caches every level returned by fetchAllLevels", async () => {
    vi.mocked(Api.fetchAllLevels).mockResolvedValue([
      { levelNumber: 1, mix: { "1d+1d": 100 } },
      { levelNumber: 2, mix: { "1dx1d": 100 } },
    ]);

    await warmLevelCache();

    expect(loadCachedLevel(1)).toEqual({ "1d+1d": 100 });
    expect(loadCachedLevel(2)).toEqual({ "1dx1d": 100 });
  });

  it("never rejects when the fetch fails — it's a best-effort cache warm, not a critical path", async () => {
    vi.mocked(Api.fetchAllLevels).mockRejectedValue(new Error("network down"));

    await expect(warmLevelCache()).resolves.toBeUndefined();
  });
});
