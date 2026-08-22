export type TrialResultInput = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: number;
};

function isTrialResultInput(value: unknown): value is TrialResultInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.levelNumber === "number" &&
    typeof r.categoryCodename === "string" &&
    typeof r.correct === "boolean" &&
    typeof r.timeExceeded === "boolean" &&
    typeof r.timeTaken === "number" &&
    typeof r.playedAt === "number"
  );
}

/** Parses and validates a sync request body; null means the body was malformed. */
export function parseTrialResults(body: unknown): TrialResultInput[] | null {
  if (typeof body !== "object" || body === null) return null;
  const trials = (body as { trials?: unknown }).trials;
  if (!Array.isArray(trials)) return null;
  return trials.every(isTrialResultInput) ? trials : null;
}

export type LevelStatsInput = {
  levelNumber: number;
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
};

export function parseLevelStats(body: unknown): LevelStatsInput | null {
  if (typeof body !== "object" || body === null) return null;
  const r = body as Record<string, unknown>;
  if (
    typeof r.levelNumber !== "number" ||
    typeof r.totalTime !== "number" ||
    typeof r.stars !== "number" ||
    ![0, 1, 2, 3].includes(r.stars)
  ) {
    return null;
  }
  return { levelNumber: r.levelNumber, stars: r.stars as 0 | 1 | 2 | 3, totalTime: r.totalTime };
}

/**
 * A record is better if it has more stars, or the same stars in less time —
 * mirrors the frontend's LevelStats comparison (storage/levelStats.ts).
 */
export function isBetterLevelRecord(
  candidate: { stars: number; totalTime: number },
  existing: { stars: number; totalTime: number } | null,
): boolean {
  if (existing === null) return true;
  if (candidate.stars > existing.stars) return true;
  return candidate.stars === existing.stars && candidate.totalTime < existing.totalTime;
}
