export type LevelRecord = { stars: 0 | 1 | 2 | 3; totalTime: number };

/**
 * A record is better if it has more stars, or the same stars in less time —
 * mirrors the backend's identical comparison (apps/backend/src/sync/logic.ts).
 * Shared so the same rule isn't duplicated everywhere it's needed: the
 * (soon-retired) localStorage cache, and the optimistic local write into
 * the levelStats RxDB collection.
 */
export function isBetterLevelRecord(candidate: LevelRecord, existing: LevelRecord | null): boolean {
  if (existing === null) return true;
  if (candidate.stars > existing.stars) return true;
  return candidate.stars === existing.stars && candidate.totalTime < existing.totalTime;
}
