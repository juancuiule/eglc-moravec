import { getLevelsDatabase, type LevelsDatabase } from "./db";
import { startLevelCatalogReplication } from "./replication";

let bootPromise: Promise<LevelsDatabase> | null = null;

/**
 * Creates the Levels database and starts its catalog replication, once for
 * the lifetime of the app — safe to call from multiple places, every caller
 * shares the same in-flight promise. On failure, clears the cache so the
 * next call retries instead of replaying the same rejection forever.
 */
export function bootLevelsCatalog(): Promise<LevelsDatabase> {
  if (!bootPromise) {
    bootPromise = getLevelsDatabase()
      .then((db) => {
        startLevelCatalogReplication(db.levels);
        return db;
      })
      .catch((error: unknown) => {
        bootPromise = null;
        throw error;
      });
  }
  return bootPromise;
}
