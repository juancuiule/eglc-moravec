import type { LevelPerformanceRow, CategoryPerformanceRow } from "./repo.js";

// "Correctness" mirrors the frontend's computeStats.ts definition: correct
// out of every attempt, regardless of timing. "Average time" is the average
// time taken among only the correct attempts — same as computeStats.ts's
// avgTimeMs, null when there are none. Keeping this consistent means an
// admin looking at this can compare it against the meaning of the numbers
// a player sees on their own Stats screen.

export type PerformanceSummary = {
  attemptCount: number;
  userCount: number;
  effectiveness: number; // 0-1, correct / attempts
  avgTimeMs: number | null;
};

function summarize(row: {
  attempt_count: number;
  user_count: number;
  correct_count: number;
  avg_time_taken: number | null;
}): PerformanceSummary {
  return {
    attemptCount: row.attempt_count,
    userCount: row.user_count,
    effectiveness: row.attempt_count > 0 ? row.correct_count / row.attempt_count : 0,
    avgTimeMs: row.avg_time_taken,
  };
}

export type LevelPerformance = PerformanceSummary & { levelNumber: number };
export type CategoryPerformance = PerformanceSummary & { categoryCodename: string };

export function summarizeLevelPerformance(rows: LevelPerformanceRow[]): LevelPerformance[] {
  return rows.map((r) => ({ levelNumber: r.level_number, ...summarize(r) }));
}

export function summarizeCategoryPerformance(rows: CategoryPerformanceRow[]): CategoryPerformance[] {
  return rows.map((r) => ({ categoryCodename: r.category_codename, ...summarize(r) }));
}
