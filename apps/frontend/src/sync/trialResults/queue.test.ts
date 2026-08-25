import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { Addition } from "engine";
import { queueTrialResults } from "./queue";
import { createAppDatabase, type AppDatabase } from "../../db/database";
import type { PersistedTrial } from "../../storage/trialHistory";
import type { TrialResult } from "../../game/index";

vi.mock("../../db/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../db/database")>();
  return { ...actual, getAppDatabase: vi.fn() };
});

vi.mock("../../randomId", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../randomId")>();
  return { ...actual, randomId: vi.fn(actual.randomId) };
});

import { getAppDatabase } from "../../db/database";
import { randomId } from "../../randomId";

let db: AppDatabase;

beforeEach(async () => {
  db = await createAppDatabase(getRxStorageMemory(), `test-queue-${Math.random().toString(36).slice(2)}`);
  vi.mocked(getAppDatabase).mockResolvedValue(db);
});

afterEach(async () => {
  await db.close();
});

function makeResult(): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    hintShown: false,
    keystrokes: [{ key: "5", t: 100 }],
    hasErased: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
  };
}

function makePersisted(): PersistedTrial {
  return {
    levelNumber: 4,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    playedAt: new Date().toISOString(),
    keystrokes: [{ key: "5", t: 100 }],
    hintShown: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
    levelRunId: "run-abc",
  };
}

describe("queueTrialResults", () => {
  it("writes every Trial into the local collection, with a unique id each", async () => {
    await queueTrialResults([makeResult(), makeResult()], [makePersisted(), makePersisted()]);

    const docs = await db.trialResults.find().exec();
    expect(docs).toHaveLength(2);
    expect(docs[0].id).not.toBe(docs[1].id);
  });

  it("starts correct/timeExceeded equal to the client's own claim, alongside the immutable clientCorrect/clientTimeExceeded", async () => {
    await queueTrialResults([makeResult()], [makePersisted()]);

    const [doc] = await db.trialResults.find().exec();
    expect(doc.correct).toBe(true);
    expect(doc.timeExceeded).toBe(false);
    expect(doc.clientCorrect).toBe(true);
    expect(doc.clientTimeExceeded).toBe(false);
  });

  it("never throws when the database itself can't be reached — must not block or interrupt play", async () => {
    vi.mocked(getAppDatabase).mockRejectedValue(new Error("IndexedDB blocked"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(queueTrialResults([makeResult()], [makePersisted()])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("logs (never throws) a per-document write failure — bulkInsert() resolves with an error array, it does not reject", async () => {
    // Force a real per-document failure: pre-insert a doc under the same id
    // the queued Trial will use, so its own bulkInsert() write conflicts.
    vi.mocked(randomId).mockReturnValueOnce("dup-id");
    await db.trialResults.insert({
      id: "dup-id",
      levelNumber: 1,
      categoryCodename: "1d+1d",
      operands: [1, 1],
      answer: 2,
      timeTaken: 100,
      playedAt: Date.now(),
      keystrokes: [],
      hintShown: false,
      streakAtSubmit: 0,
      hintsAvailableAtStart: 3,
      levelRunId: "run-x",
      clientCorrect: true,
      clientTimeExceeded: false,
      correct: true,
      timeExceeded: false,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(queueTrialResults([makeResult()], [makePersisted()])).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't queue"), expect.anything());
  });
});
