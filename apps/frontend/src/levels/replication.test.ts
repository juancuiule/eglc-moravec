import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { createAppDatabase, type AppDatabase } from "../db/database";
import { startLevelCatalogReplication } from "./replication";
import { Api } from "../api/Api";

vi.mock("../api/Api", () => ({
  Api: {
    fetchLevelNumbers: vi.fn(),
    fetchLevel: vi.fn(),
  },
}));

describe("Level catalog replication", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createAppDatabase(getRxStorageMemory(), `test-levels-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await db.close();
  });

  it("replicates every Level from the backend into the local collection", async () => {
    vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2]);
    vi.mocked(Api.fetchLevel).mockImplementation(async (levelNumber): Promise<Record<string, number>> =>
      levelNumber === 1 ? { addition: 100 } : { multiplication: 100 },
    );

    const replicationState = startLevelCatalogReplication(db.levels);
    await replicationState.awaitInitialReplication();

    const docs = await db.levels.find().exec();
    expect(docs.map((d) => d.levelNumber).sort()).toEqual(["1", "2"]);
    const level1 = await db.levels.findOne("1").exec();
    expect(level1?.mix).toEqual({ addition: 100 });

    await replicationState.cancel();
  });

  it("retries after a failed pull instead of leaving the collection empty", async () => {
    vi.mocked(Api.fetchLevelNumbers)
      .mockRejectedValueOnce(new Error("backend unreachable"))
      .mockResolvedValue([1]);
    vi.mocked(Api.fetchLevel).mockResolvedValue({ addition: 100 });

    const replicationState = startLevelCatalogReplication(db.levels, { retryTime: 20 });
    const sawError = new Promise<void>((resolve) => {
      replicationState.error$.subscribe(() => resolve());
    });

    await sawError;
    await replicationState.awaitInitialReplication();

    const level1 = await db.levels.findOne("1").exec();
    expect(level1?.mix).toEqual({ addition: 100 });

    await replicationState.cancel();
  });

  it("picks up a newly added Level on a later sync", async () => {
    vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1]);
    vi.mocked(Api.fetchLevel).mockResolvedValue({ addition: 100 });

    const replicationState = startLevelCatalogReplication(db.levels);
    await replicationState.awaitInitialReplication();
    expect(await db.levels.find().exec()).toHaveLength(1);

    vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2]);
    vi.mocked(Api.fetchLevel).mockImplementation(async (levelNumber): Promise<Record<string, number>> =>
      levelNumber === 1 ? { addition: 100 } : { multiplication: 100 },
    );
    replicationState.reSync();
    await replicationState.awaitInSync();

    const docs = await db.levels.find().exec();
    expect(docs.map((d) => d.levelNumber).sort()).toEqual(["1", "2"]);

    await replicationState.cancel();
  });
});

describe("Level schema", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createAppDatabase(getRxStorageMemory(), `test-schema-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await db.close();
  });

  it("stores and reads back a Level document by its primary key", async () => {
    await db.levels.insert({ levelNumber: "42", mix: { addition: 100 } });

    const doc = await db.levels.findOne("42").exec();
    expect(doc?.mix).toEqual({ addition: 100 });
  });
});
