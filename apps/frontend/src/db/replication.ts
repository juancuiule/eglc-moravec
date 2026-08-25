import { startLevelCatalogReplication } from "../levels/replication";
import { startTrialResultsReplication } from "../sync/trialResults/replication";
import type { AppDatabase } from "./database";

/** Starts every collection's replication — the one place that grows as new collections do. */
export function startAllReplications(db: AppDatabase): void {
  startLevelCatalogReplication(db.levels);
  startTrialResultsReplication(db.trialResults);
}
