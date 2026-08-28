import type { Finished } from "./index";
import type { AuthState } from "../auth/store";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { sync } from "../sync/syncEngine";

/**
 * Persists a finished Level locally, and triggers a sync for any session at
 * all — anonymous or logged in; sync() itself no-ops for a LoggedOut one.
 * Every player gets an anonymous session automatically (see AuthBoot/
 * ensureSession), so LoggedOut here only means that first request hasn't
 * resolved yet or failed; trials synced while anonymous are folded into a
 * real account later if the player logs in.
 *
 * Returns whether this run set a new record for the level (see
 * `updateLevelRecord`) — FinishedScreen uses this to decide whether to
 * celebrate.
 */
export function persistFinishedLevel(state: Finished, authState: AuthState): boolean {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  const isNewRecord = updateLevelRecord(config.levelNumber, state.runId, {
    stars,
    totalTime,
    levelCompleted: state.levelCompleted,
  });
  const persistedTrials = buildPersistedTrials(config, results, state.runId);
  appendTrials(persistedTrials);

  void sync(authState);

  return isNewRecord;
}
