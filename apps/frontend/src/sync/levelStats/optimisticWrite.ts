import type { RxCollection } from "rxdb";
import { getAppDatabase } from "../../db/database";
import { isBetterLevelRecord } from "../../levelStats/isBetterLevelRecord";
import type { LevelStatsDocType } from "./schema";

/**
 * Insert-first, catch-the-conflict-and-reconcile: atomic against a
 * concurrent pull replication write to the same document, unlike a
 * read-then-conditionally-write sequence (findOne + upsert), which can race
 * a pull landing between the read and the write and silently lose it.
 */
async function createOrImproveLevelStats(
  collection: RxCollection<LevelStatsDocType>,
  key: string,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number },
): Promise<void> {
  try {
    await collection.insert({
      levelNumber: key,
      stars: run.stars,
      totalTime: run.totalTime,
      completedAt: Date.now(),
    });
  } catch (error) {
    if (!(error instanceof Error) || (error as { code?: string }).code !== "CONFLICT") throw error;

    const doc = await collection.findOne(key).exec();
    if (!doc) throw error;

    await doc.incrementalModify((current) => {
      const existing = { stars: current.stars as 0 | 1 | 2 | 3, totalTime: current.totalTime };
      if (!isBetterLevelRecord(run, existing)) return current;
      return { ...current, stars: run.stars, totalTime: run.totalTime, completedAt: Date.now() };
    });
  }
}

/**
 * The moment a Level finishes, writes the player's own best-record guess
 * directly into the local levelStats collection — a plain local write, not
 * a replicated push (the server is the sole authority on what actually
 * counts as the record; see replication.ts). This is what keeps
 * unlock-gating and the Levels list responsive with zero network right
 * after finishing a Level; the next successful pull overwrites this guess
 * with whatever the server determines is authoritative, whether that's the
 * same value, a correction, or a better value from another device.
 *
 * Applies the same "better wins" comparison the local write always has, so
 * replaying a Level worse than an already-confirmed record doesn't
 * transiently downgrade what's shown before the next pull corrects it.
 */
export async function writeOptimisticLevelStats(
  levelNumber: number,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number },
): Promise<void> {
  try {
    const db = await getAppDatabase();
    await createOrImproveLevelStats(db.levelStats, String(levelNumber), run);
  } catch (error) {
    console.error(`Couldn't write the optimistic Level ${levelNumber} record locally:`, error);
  }
}
