import { isBetterLevelRecord } from "engine";
import { localStore } from "./store";
import { randomId } from "../randomId";

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms, sum of all trial times
  completedAt: string; // ISO date
};

export type PersistedLevelStats = Record<string, LevelStats>;

/**
 * Derived on every read from the `levelRuns` table, never a stored
 * snapshot: folds every run per level with `isBetterLevelRecord` (the same
 * comparison used throughout) so nothing can drift out of sync with
 * `levelRuns` — the exact bug class a cache would introduce.
 */
export function loadLevelStats(): PersistedLevelStats {
  const table = localStore.getTable("levelRuns");
  const bestByLevel = new Map<number, { stars: number; totalTime: number; playedAt: string }>();

  Object.values(table).forEach((row) => {
    const levelNumber = row.levelNumber as number;
    const candidate = { stars: row.stars as number, totalTime: row.totalTime as number };
    const existing = bestByLevel.get(levelNumber) ?? null;
    if (isBetterLevelRecord(candidate, existing)) {
      bestByLevel.set(levelNumber, { ...candidate, playedAt: row.playedAt as string });
    }
  });

  return Object.fromEntries(
    Array.from(bestByLevel.entries()).map(([levelNumber, r]) => [
      String(levelNumber),
      { stars: r.stars as 0 | 1 | 2 | 3, totalTime: r.totalTime, completedAt: r.playedAt },
    ]),
  );
}

/**
 * Seeds `levelRuns` rows directly from a stats snapshot — test-only (see
 * this module's own tests and components/LevelPlay.test.tsx). Each entry
 * becomes its own already-synced run under a fresh id, since a snapshot
 * never carried a real run id to preserve.
 */
export function saveLevelStats(stats: PersistedLevelStats): void {
  Object.entries(stats).forEach(([levelNumber, s]) => {
    localStore.setRow("levelRuns", randomId(), {
      levelNumber: Number(levelNumber),
      stars: s.stars,
      totalTime: s.totalTime,
      levelCompleted: s.stars > 0,
      playedAt: s.completedAt,
      synced: true,
    });
  });
}

/**
 * Records a Level run — every attempt, not just the best, mirroring the
 * backend's `level_runs` table. `runId` must be the same client-generated
 * id threaded through the run's trials, so a later sync's pull lands on
 * this exact row instead of creating a duplicate. Returns whether this run
 * is a new best-ever record for the level, judged against whatever was on
 * top immediately before this write.
 */
export function updateLevelRecord(
  levelNumber: number,
  runId: string,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number; levelCompleted: boolean },
): boolean {
  const existing = loadLevelStats()[String(levelNumber)] ?? null;
  const isNewRecord = isBetterLevelRecord(run, existing);

  localStore.setRow("levelRuns", runId, {
    id: runId,
    levelNumber,
    stars: run.stars,
    totalTime: run.totalTime,
    levelCompleted: run.levelCompleted,
    playedAt: new Date().toISOString(),
    synced: false,
  });

  return isNewRecord;
}

/** A Level unlocks once the previous one has been completed with at least one star. Level 1 is always open. */
export function isLevelUnlocked(levelNumber: number, stats: PersistedLevelStats): boolean {
  if (levelNumber === 1) return true;
  return (stats[String(levelNumber - 1)]?.stars ?? 0) > 0;
}

/**
 * Merges a remote LevelStats snapshot into local storage. Vestigial: the
 * endpoint this consumed (`GET /sync/level-stats`) no longer exists (see
 * ticket #37) — LevelStats is now derived from pulled `levelRuns` rows
 * directly (ticket #39), which supersedes this whole flow. Kept only so
 * `sync/syncLevelStatsFromRemote.ts` still compiles until that ticket
 * removes it; never reached in practice today, since its caller's request
 * already 404s.
 */
export function mergeRemoteLevelStats(remote: PersistedLevelStats): void {
  Object.entries(remote).forEach(([levelNumber, stats]) => {
    updateLevelRecord(Number(levelNumber), randomId(), {
      stars: stats.stars,
      totalTime: stats.totalTime,
      levelCompleted: stats.stars > 0,
    });
  });
}
