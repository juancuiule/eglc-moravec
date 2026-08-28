import { isBetterLevelRecord } from "engine";
import { store } from "./store";

const TABLE = "levelStats";

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms, sum of all trial times
  completedAt: string; // ISO date
};

export type PersistedLevelStats = Record<string, LevelStats>;

export function loadLevelStats(): PersistedLevelStats {
  const result: PersistedLevelStats = {};
  Object.entries(store.getTable(TABLE)).forEach(([levelNumber, row]) => {
    result[levelNumber] = row as LevelStats;
  });
  return result;
}

export function saveLevelStats(stats: PersistedLevelStats): void {
  Object.entries(stats).forEach(([levelNumber, levelStats]) => {
    store.setRow(TABLE, levelNumber, levelStats);
  });
}

/**
 * Update the stored record for a level if the new run is better.
 * Better means: more stars, or same stars with less total time.
 * Returns whether it was — the record must be read *before* this call
 * overwrites it, so this is the only point that can answer that.
 */
export function updateLevelRecord(
  levelNumber: number,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number },
): boolean {
  const key = String(levelNumber);
  // getRow returns {} (truthy!) for a missing row, not undefined — hasRow
  // is the only reliable way to distinguish "no record yet" from a real one.
  const existing = store.hasRow(TABLE, key) ? (store.getRow(TABLE, key) as LevelStats) : undefined;

  const isNewRecord = isBetterLevelRecord(run, existing);
  if (!isNewRecord) return false;

  store.setRow(TABLE, key, {
    stars: run.stars,
    totalTime: run.totalTime,
    completedAt: new Date().toISOString(),
  });
  return true;
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
