import { describe, it, expect, vi } from "vitest";
import { pullLevelStats } from "./pull";

describe("pullLevelStats", () => {
  it("returns the parsed levelStats on success", async () => {
    const levelStats = { "1": { stars: 3, totalTime: 5000, completedAt: "2026-01-01T00:00:00.000Z" } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ levelStats }) }),
    );

    const result = await pullLevelStats("tok123");

    expect(result).toEqual(levelStats);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/sync/level-stats"),
      expect.objectContaining({ headers: { Authorization: "Bearer tok123" } }),
    );
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await pullLevelStats("tok123")).toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await pullLevelStats("tok123")).toBeNull();
  });
});
