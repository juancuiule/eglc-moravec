import type { PracticeStopped } from "./index";
import type { AuthState } from "../auth/store";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";
import { pushPracticeResults } from "../sync/pushPracticeResults";

/**
 * Persists a stopped Practice session locally, and syncs it to the backend
 * for any session at all — anonymous or logged in — mirroring
 * persistFinishedLevel.ts's Level equivalent. Practice was local-only by
 * earlier design (see CONTEXT.md's Sync entry); that's since been reversed.
 */
export function persistStoppedPractice(state: PracticeStopped, authState: AuthState): void {
  const trials = buildPersistedPracticeTrials(state.results, state.runId);
  appendPracticeTrials(trials);

  if (authState.type !== "loggedOut") {
    pushPracticeResults(authState.token, state.results, trials);
  }
}
