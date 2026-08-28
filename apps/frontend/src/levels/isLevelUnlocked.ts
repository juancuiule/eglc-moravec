import type { LevelStats } from "../api/Api";

/** A Level unlocks once the previous one has been completed with at least one star. Level 1 is always open. */
export function isLevelUnlocked(
  levelNumber: number,
  stats: Record<string, LevelStats>,
): boolean {
  if (levelNumber === 1) return true;
  return (stats[String(levelNumber - 1)]?.stars ?? 0) > 0;
}
