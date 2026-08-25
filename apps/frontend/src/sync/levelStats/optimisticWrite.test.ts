import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { writeOptimisticLevelStats } from "./optimisticWrite";
import { createAppDatabase, type AppDatabase } from "../../db/database";

vi.mock("../../db/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../db/database")>();
  return { ...actual, getAppDatabase: vi.fn() };
});

import { getAppDatabase } from "../../db/database";

let db: AppDatabase;

beforeEach(async () => {
  db = await createAppDatabase(getRxStorageMemory(), `test-optimistic-${Math.random().toString(36).slice(2)}`);
  vi.mocked(getAppDatabase).mockResolvedValue(db);
});

afterEach(async () => {
  await db.close();
});

describe("writeOptimisticLevelStats", () => {
  it("writes a first record for a Level with no existing one", async () => {
    await writeOptimisticLevelStats(4, { stars: 2, totalTime: 2500 });

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc).toMatchObject({ levelNumber: "4", stars: 2, totalTime: 2500 });
  });

  it("overwrites with a better record (more stars)", async () => {
    await writeOptimisticLevelStats(4, { stars: 1, totalTime: 5000 });
    await writeOptimisticLevelStats(4, { stars: 2, totalTime: 5000 });

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc?.stars).toBe(2);
  });

  it("never overwrites with a worse record — a replay should not transiently downgrade the shown best", async () => {
    await writeOptimisticLevelStats(4, { stars: 3, totalTime: 2000 });
    await writeOptimisticLevelStats(4, { stars: 1, totalTime: 9000 });

    const doc = await db.levelStats.findOne("4").exec();
    expect(doc).toMatchObject({ stars: 3, totalTime: 2000 });
  });

  it("never throws when the local write fails — must not block or interrupt play", async () => {
    vi.mocked(getAppDatabase).mockRejectedValue(new Error("IndexedDB blocked"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeOptimisticLevelStats(4, { stars: 2, totalTime: 2500 })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
