import type { RxCollection, RxReplicationWriteToMasterRow, WithDeleted } from "rxdb";
import { replicateRxCollection, type RxReplicationState } from "rxdb/plugins/replication";
import { Api } from "../../api/Api";
import { authStore } from "../../auth/store";
import type { TrialResultDocType } from "./schema";

const REPLICATION_IDENTIFIER = "moravec-trial-results-push";

/**
 * Read fresh on every push, never captured once — the anonymous session's
 * token stops being valid the moment it upgrades to a real account
 * (verifyOtp() issues a brand new one), so a handler that closed over a
 * stale token would keep syncing against a discarded identity.
 */
function currentToken(): string | null {
  const state = authStore.getState().state;
  return state.type === "loggedOut" ? null : state.token;
}

/**
 * Push-only: every pushed Trial always comes back enriched with the
 * backend's authoritative correct/timeExceeded, whether or not it agreed
 * with the client's own claim — the client structurally cannot know those
 * fields until the backend computes them, so this is enrichment on every
 * push, not conflict resolution reserved for disagreements.
 */
async function pushTrialResults(
  rows: RxReplicationWriteToMasterRow<TrialResultDocType>[],
): Promise<WithDeleted<TrialResultDocType>[]> {
  const token = currentToken();
  if (token === null) {
    // No session yet (ensureSession() hasn't resolved). Throwing fails this
    // push attempt the same way a network error would — RxDB retries the
    // same batch again shortly, by which point a token almost always exists.
    throw new Error("No auth token available yet");
  }

  const trials = rows.map((row) => row.newDocumentState);
  const authoritative = await Api.pushTrialResults(token, trials);
  return authoritative.map((trial) => ({ ...trial, _deleted: false }));
}

export function startTrialResultsReplication(
  collection: RxCollection<TrialResultDocType>,
  options?: { retryTime?: number },
): RxReplicationState<TrialResultDocType, undefined> {
  return replicateRxCollection<TrialResultDocType, undefined>({
    replicationIdentifier: REPLICATION_IDENTIFIER,
    collection,
    retryTime: options?.retryTime,
    push: {
      handler: pushTrialResults,
      batchSize: 100,
    },
  });
}
