const STORAGE_KEY = "moravec:levelStats";

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms, sum of all trial times
  completedAt: string; // ISO date
};

export type PersistedLevelStats = Record<string, LevelStats>;

export function loadLevelStats(): PersistedLevelStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedLevelStats;
  } catch {
    return {};
  }
}

export function saveLevelStats(stats: PersistedLevelStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

/**
 * Update the stored record for a level if the new run is better.
 * Better means: more stars, or same stars with less total time.
 */
export function updateLevelRecord(
  levelNumber: number,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number },
): void {
  const key = String(levelNumber);
  const all = loadLevelStats();
  const existing = all[key];

  const isBetter =
    !existing ||
    run.stars > existing.stars ||
    (run.stars === existing.stars && run.totalTime < existing.totalTime);

  if (!isBetter) return;

  all[key] = {
    stars: run.stars,
    totalTime: run.totalTime,
    completedAt: new Date().toISOString(),
  };
  saveLevelStats(all);
}
