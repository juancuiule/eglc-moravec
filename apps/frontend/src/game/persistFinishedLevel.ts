import type { Finished } from "./index";
import type { AuthState } from "../auth/index";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { pushResults, pushLevelStats } from "../sync/push";

/** Persists a finished Level locally, and syncs it to the backend if the player is logged in. */
export function persistFinishedLevel(state: Finished, authState: AuthState): void {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  updateLevelRecord(config.levelNumber, { stars, totalTime });
  const persistedTrials = buildPersistedTrials(config, results);
  appendTrials(persistedTrials);

  if (authState.type === "loggedIn") {
    pushResults(authState.token, results, persistedTrials);
    pushLevelStats(authState.token, config.levelNumber, { stars, totalTime });
  }
}
