import { bootLevelsCatalog } from "./boot";

/**
 * Reads one Level's mix from the local replica. Null both when it hasn't
 * replicated (yet) and when the local database itself couldn't be opened
 * (e.g. IndexedDB blocked) — either way there is no local copy to fall back
 * to, and the caller treats both the same: show the "unavailable" state
 * instead of getting stuck waiting on a promise that will never resolve.
 */
export async function getLocalLevelMix(levelNumber: number): Promise<Record<string, number> | null> {
  try {
    const db = await bootLevelsCatalog();
    const doc = await db.levels.findOne(String(levelNumber)).exec();
    return doc ? doc.mix : null;
  } catch {
    return null;
  }
}
