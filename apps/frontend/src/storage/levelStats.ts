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

  saveLevelStats({
    ...all,
    [key]: {
      stars: run.stars,
      totalTime: run.totalTime,
      completedAt: new Date().toISOString(),
    },
  });
}

/** A Level unlocks once the previous one has been completed with at least one star. Level 1 is always open. */
export function isLevelUnlocked(levelNumber: number, stats: PersistedLevelStats): boolean {
  if (levelNumber === 1) return true;
  return (stats[String(levelNumber - 1)]?.stars ?? 0) > 0;
}

/**
 * Merge a remote LevelStats snapshot (fetched on login) into local storage.
 * Uses the same better-record comparison as updateLevelRecord, so a device
 * with a better local record is never downgraded by an older remote one.
 */
export function mergeRemoteLevelStats(remote: PersistedLevelStats): void {
  Object.entries(remote).forEach(([levelNumber, stats]) => {
    updateLevelRecord(Number(levelNumber), { stars: stats.stars, totalTime: stats.totalTime });
  });
}
