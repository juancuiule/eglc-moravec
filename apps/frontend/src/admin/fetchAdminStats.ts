import { API_URL } from "../apiUrl";

export type PerformanceSummary = {
  attemptCount: number;
  userCount: number;
  effectiveness: number; // 0-1
  avgTimeMs: number | null;
};

export type LevelPerformance = PerformanceSummary & { levelNumber: number };
export type CategoryPerformance = PerformanceSummary & { categoryCodename: string };

export type AdminStats = {
  byLevel: LevelPerformance[];
  byCategory: CategoryPerformance[];
};

/** Fetches cross-user level-performance analytics from the admin endpoint, or null on failure. */
export async function fetchAdminStats(): Promise<AdminStats | null> {
  try {
    const res = await fetch(`${API_URL}/admin/stats`);
    if (!res.ok) return null;
    return (await res.json()) as AdminStats;
  } catch {
    return null;
  }
}
