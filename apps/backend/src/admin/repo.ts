import type { DatabaseSync } from "node:sqlite";

// Deliberately visible as a different shape from sync/repo.ts: every query
// here aggregates across ALL Users, breaking the per-user-scoping
// convention every other repo module follows. That's the point — this is
// the one place in the codebase that's allowed to.

export type LevelPerformanceRow = {
  level_number: number;
  attempt_count: number;
  user_count: number;
  correct_in_time_count: number;
  avg_time_taken: number | null;
};

export function getLevelPerformance(db: DatabaseSync): LevelPerformanceRow[] {
  return db
    .prepare(
      `SELECT
         level_number,
         COUNT(*) AS attempt_count,
         COUNT(DISTINCT email_hash) AS user_count,
         SUM(CASE WHEN correct = 1 AND time_exceeded = 0 THEN 1 ELSE 0 END) AS correct_in_time_count,
         AVG(CASE WHEN correct = 1 AND time_exceeded = 0 THEN time_taken ELSE NULL END) AS avg_time_taken
       FROM trial_results
       GROUP BY level_number
       ORDER BY level_number`,
    )
    .all() as LevelPerformanceRow[];
}

export type CategoryPerformanceRow = {
  category_codename: string;
  attempt_count: number;
  user_count: number;
  correct_in_time_count: number;
  avg_time_taken: number | null;
};

export function getCategoryPerformance(db: DatabaseSync): CategoryPerformanceRow[] {
  return db
    .prepare(
      `SELECT
         category_codename,
         COUNT(*) AS attempt_count,
         COUNT(DISTINCT email_hash) AS user_count,
         SUM(CASE WHEN correct = 1 AND time_exceeded = 0 THEN 1 ELSE 0 END) AS correct_in_time_count,
         AVG(CASE WHEN correct = 1 AND time_exceeded = 0 THEN time_taken ELSE NULL END) AS avg_time_taken
       FROM trial_results
       GROUP BY category_codename
       ORDER BY category_codename`,
    )
    .all() as CategoryPerformanceRow[];
}
