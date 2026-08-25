import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { createAppDatabase, type AppDatabase } from "../../db/database";
import { startLevelStatsReplication } from "./replication";
import { authStore } from "../../auth/store";
import { Api } from "../../api/Api";

vi.mock("../../api/Api", () => ({
  Api: {
    pullLevelStatsEntries: vi.fn(),
  },
}));

describe("Level stats pull replication", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    vi.resetAllMocks();
    db = await createAppDatabase(getRxStorageMemory(), `test-levelstats-${Math.random().toString(36).slice(2)}`);
    authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
  });

  afterEach(async () => {
    authStore.setState({ state: { type: "loggedOut" } });
    await db.close();
  });

  it("pulls the backend's Level-stats into the local collection", async () => {
    vi.mocked(Api.pullLevelStatsEntries).mockResolvedValue([
      { levelNumber: 4, stars: 2, totalTime: 2500, completedAt: 1735689600000 },
    ]);

    const replicationState = startLevelStatsReplication(db.levelStats);
    await replicationState.awaitInitialReplication();

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc).toMatchObject({ stars: 2, totalTime: 2500 });

    await replicationState.cancel();
  });

  it("overwrites a local optimistic guess with the server's authoritative correction once the pull lands", async () => {
    // The optimistic local write believes 3 stars; the server disagrees.
    await db.levelStats.insert({ levelNumber: "4", stars: 3, totalTime: 2000, completedAt: Date.now() });
    vi.mocked(Api.pullLevelStatsEntries).mockResolvedValue([
      { levelNumber: 4, stars: 1, totalTime: 9000, completedAt: 1735689600000 },
    ]);

    const replicationState = startLevelStatsReplication(db.levelStats);
    await replicationState.awaitInitialReplication();

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc).toMatchObject({ stars: 1, totalTime: 9000 }); // trusts the server outright, no local re-comparison

    await replicationState.cancel();
  });

  it("retries after a failed pull instead of leaving stats stuck", async () => {
    vi.mocked(Api.pullLevelStatsEntries)
      .mockRejectedValueOnce(new Error("backend unreachable"))
      .mockResolvedValue([{ levelNumber: 4, stars: 2, totalTime: 2500, completedAt: 1735689600000 }]);

    const replicationState = startLevelStatsReplication(db.levelStats, { retryTime: 20 });
    const sawError = new Promise<void>((resolve) => {
      replicationState.error$.subscribe(() => resolve());
    });

    await sawError;
    await replicationState.awaitInitialReplication();

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc).toMatchObject({ stars: 2 });

    await replicationState.cancel();
  });

  it("fails the pull (retried later) instead of crashing when there is no session yet", async () => {
    authStore.setState({ state: { type: "loggedOut" } });
    vi.mocked(Api.pullLevelStatsEntries).mockResolvedValue([]);

    const replicationState = startLevelStatsReplication(db.levelStats, { retryTime: 20 });
    const sawError = new Promise<void>((resolve) => {
      replicationState.error$.subscribe(() => resolve());
    });

    await sawError;
    expect(Api.pullLevelStatsEntries).not.toHaveBeenCalled();

    await replicationState.cancel();
  });
});
