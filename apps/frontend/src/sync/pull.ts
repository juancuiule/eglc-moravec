import type { PersistedLevelStats } from "../storage/levelStats";
import { API_URL } from "../apiUrl";

/** Fetches the logged-in User's remote LevelStats, or null on any failure. */
export async function pullLevelStats(token: string): Promise<PersistedLevelStats | null> {
  try {
    const res = await fetch(`${API_URL}/sync/level-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.levelStats as PersistedLevelStats;
  } catch {
    return null;
  }
}
