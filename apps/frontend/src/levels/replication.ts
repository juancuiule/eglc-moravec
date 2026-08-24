import type { RxCollection, WithDeleted } from "rxdb";
import { replicateRxCollection, type RxReplicationState } from "rxdb/plugins/replication";
import { Api } from "../api/Api";
import type { LevelDocType } from "./schema";

const REPLICATION_IDENTIFIER = "moravec-levels-pull";

/**
 * The Level catalog is small (order of hundreds of rows) and read-only, so
 * every pull just re-fetches the whole thing rather than tracking an
 * incremental checkpoint — simpler, and RxDB only writes the documents that
 * actually changed since the last pull.
 */
async function fetchLevelCatalog(): Promise<WithDeleted<LevelDocType>[]> {
  const levelNumbers = await Api.fetchLevelNumbers();
  const mixes = await Promise.all(levelNumbers.map((levelNumber) => Api.fetchLevel(levelNumber)));
  return levelNumbers.map((levelNumber, i) => {
    const mix = mixes[i];
    if (mix === null) {
      throw new Error(`Level ${levelNumber} was listed but its content could not be found`);
    }
    return { levelNumber: String(levelNumber), mix, _deleted: false };
  });
}

/**
 * Pull-only: the Level catalog is server-authoritative reference data, never
 * written to from the client, so there is no push handler and nothing to
 * resolve conflicts for. `live: true` (the default) keeps this replication
 * running for the lifetime of the app — RxDB retries a failed pull after
 * `retryTime`, skipping the wait entirely once the browser's `online` event
 * fires again.
 */
export function startLevelCatalogReplication(
  collection: RxCollection<LevelDocType>,
  options?: { retryTime?: number },
): RxReplicationState<LevelDocType, undefined> {
  return replicateRxCollection<LevelDocType, undefined>({
    replicationIdentifier: REPLICATION_IDENTIFIER,
    collection,
    retryTime: options?.retryTime,
    pull: {
      handler: async () => ({
        documents: await fetchLevelCatalog(),
        checkpoint: undefined,
      }),
      batchSize: 1000,
    },
  });
}
