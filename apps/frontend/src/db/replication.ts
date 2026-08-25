import { startLevelCatalogReplication } from "../levels/replication";
import { startTrialResultsReplication } from "../sync/trialResults/replication";
import { startLevelStatsReplication } from "../sync/levelStats/replication";
import type { AppDatabase } from "./database";

/** Starts every collection's replication — the one place that grows as new collections do. */
export function startAllReplications(db: AppDatabase): void {
  startLevelCatalogReplication(db.levels);

  const trialResultsReplication = startTrialResultsReplication(db.trialResults);
  const levelStatsReplication = startLevelStatsReplication(db.levelStats);

  // The backend derives a Level's stats from its Trial results, so a
  // confirmed Trial push means fresh Level-stats may already be waiting —
  // pull them in immediately instead of waiting for the next periodic or
  // reconnect-triggered pull.
  trialResultsReplication.sent$.subscribe(() => {
    levelStatsReplication.reSync();
  });
}
