import { startLevelCatalogReplication } from "../levels/replication";
import type { AppDatabase } from "./database";

/** Starts every collection's replication — the one place that grows as new collections do. */
export function startAllReplications(db: AppDatabase): void {
  startLevelCatalogReplication(db.levels);
}
