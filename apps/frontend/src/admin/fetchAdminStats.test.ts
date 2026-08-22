import { describe, it, expect, vi } from "vitest";
import { fetchAdminStats } from "./fetchAdminStats";

describe("fetchAdminStats", () => {
  it("returns the parsed stats on success", async () => {
    const stats = {
      byLevel: [{ levelNumber: 1, attemptCount: 5, userCount: 2, effectiveness: 0.8, avgTimeMs: 1200 }],
      byCategory: [{ categoryCodename: "1d+1d", attemptCount: 5, userCount: 2, effectiveness: 0.8, avgTimeMs: 1200 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(stats) }));

    expect(await fetchAdminStats()).toEqual(stats);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/admin/stats"));
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchAdminStats()).toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await fetchAdminStats()).toBeNull();
  });
});
