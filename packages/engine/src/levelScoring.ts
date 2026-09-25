export const LEVEL_COMPLETE_THRESHOLD = 15;

// Size of the initial level fixture seeded into the backend catalog — not a
// product limit. The database-backed catalog is authoritative and may grow or
// shrink; synced historical level numbers carry no hard maximum.
export const SEED_LEVEL_COUNT = 150;
export const TRIALS_PER_LEVEL = 20;

export function starsForScore(correctCount: number): 0 | 1 | 2 | 3 {
  if (correctCount >= 20) return 3;
  if (correctCount >= 17) return 2;
  if (correctCount >= 15) return 1;
  return 0;
}

export type LevelRecordCandidate = { stars: number; totalTime: number };

export function isBetterLevelRecord(
  candidate: LevelRecordCandidate,
  existing: LevelRecordCandidate | null | undefined,
): boolean {
  return (
    !existing ||
    candidate.stars > existing.stars ||
    (candidate.stars === existing.stars &&
      candidate.totalTime < existing.totalTime)
  );
}
