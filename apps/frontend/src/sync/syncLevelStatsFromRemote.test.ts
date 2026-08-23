import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { pullLevelStats: vi.fn() } }));
vi.mock("../storage/levelStats", () => ({ mergeRemoteLevelStats: vi.fn() }));

import { syncLevelStatsFromRemote } from "./syncLevelStatsFromRemote";
import { Api } from "../api/Api";
import { mergeRemoteLevelStats } from "../storage/levelStats";

describe("syncLevelStatsFromRemote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges the pulled LevelStats into local storage", async () => {
    const remote = { "1": { stars: 3 as const, totalTime: 5000, completedAt: "x" } };
    vi.mocked(Api.pullLevelStats).mockResolvedValue(remote);

    await syncLevelStatsFromRemote("tok");

    expect(Api.pullLevelStats).toHaveBeenCalledWith("tok");
    expect(mergeRemoteLevelStats).toHaveBeenCalledWith(remote);
  });

  it("is best-effort — a failed pull never throws", async () => {
    vi.mocked(Api.pullLevelStats).mockRejectedValue(new Error("network down"));

    await expect(syncLevelStatsFromRemote("tok")).resolves.toBeUndefined();
    expect(mergeRemoteLevelStats).not.toHaveBeenCalled();
  });
});
