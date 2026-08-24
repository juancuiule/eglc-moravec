import type { Finished } from "./index";
import type { AuthState } from "../auth/store";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { pushResults } from "../sync/pushResults";

/**
 * Persists a finished Level locally, and syncs it to the backend for any
 * session at all — anonymous or logged in. Every player gets an anonymous
 * session automatically (see AuthBoot/ensureSession), so LoggedOut here
 * only means that first request hasn't resolved yet or failed; trials
 * pushed while anonymous are folded into a real account later if the
 * player logs in.
 */
export function persistFinishedLevel(state: Finished, authState: AuthState): void {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  updateLevelRecord(config.levelNumber, { stars, totalTime });
  const persistedTrials = buildPersistedTrials(config, results, state.runId);
  appendTrials(persistedTrials);

  if (authState.type !== "loggedOut") {
    pushResults(authState.token, results, persistedTrials);
  }
}
