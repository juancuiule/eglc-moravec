import type { RxCollection, WithDeleted } from "rxdb";
import { replicateRxCollection, type RxReplicationState } from "rxdb/plugins/replication";
import { Api } from "../../api/Api";
import { authStore } from "../../auth/store";
import type { LevelStatsDocType } from "./schema";

const REPLICATION_IDENTIFIER = "moravec-level-stats-pull";

function currentToken(): string | null {
  const state = authStore.getState().state;
  return state.type === "loggedOut" ? null : state.token;
}

/**
 * The Level-stats table is small (at most one row per Level per user), so
 * every pull just re-fetches all of it rather than tracking an incremental
 * checkpoint — the same choice ticket 01 made for the Level catalog, for
 * the same reason.
 */
async function fetchLevelStats(): Promise<WithDeleted<LevelStatsDocType>[]> {
  const token = currentToken();
  if (token === null) {
    // No session yet (ensureSession() hasn't resolved) — fail this pull
    // attempt the same way a network error would; RxDB retries shortly.
    throw new Error("No auth token available yet");
  }

  const entries = await Api.pullLevelStatsEntries(token);
  return entries.map((entry) => ({
    levelNumber: String(entry.levelNumber),
    stars: entry.stars,
    totalTime: entry.totalTime,
    completedAt: entry.completedAt,
    _deleted: false,
  }));
}

/**
 * Pull-only: the server is the sole authority on a Level's best record
 * (derived from validated Trial data — see ../trialResults), so the client
 * never pushes a candidate here. See optimisticWrite.ts for how a
 * just-finished Level's local guess gets in front of a player before this
 * pull ever runs.
 */
export function startLevelStatsReplication(
  collection: RxCollection<LevelStatsDocType>,
  options?: { retryTime?: number },
): RxReplicationState<LevelStatsDocType, undefined> {
  return replicateRxCollection<LevelStatsDocType, undefined>({
    replicationIdentifier: REPLICATION_IDENTIFIER,
    collection,
    retryTime: options?.retryTime,
    pull: {
      handler: async () => ({
        documents: await fetchLevelStats(),
        checkpoint: undefined,
      }),
      batchSize: 1000,
    },
  });
}
