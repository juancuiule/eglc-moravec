export const LEVEL_COMPLETE_THRESHOLD = 5;

export const TOTAL_LEVELS = 150;
export const TRIALS_PER_LEVEL = 5;

export function starsForScore(correctCount: number): 0 | 1 | 2 | 3 {
  return 3;
  // if (correctCount >= 20) return 3;
  // if (correctCount >= 17) return 2;
  // if (correctCount >= 15) return 1;
  // return 0;
}

export type LevelRecordCandidate = { stars: number; totalTime: number };

/** A record is better than the existing one if it has more stars, or the same stars in less total time. */
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
