import type { PracticeStopped } from "./index";
import type { AuthState } from "../auth/store";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";
import { sync } from "../sync/syncEngine";

/**
 * Persists a stopped Practice session locally, and triggers a sync for any
 * session at all — anonymous or logged in; sync() itself no-ops for a
 * LoggedOut one — mirroring persistFinishedLevel.ts's Level equivalent.
 * Practice was local-only by earlier design (see CONTEXT.md's Sync entry);
 * that's since been reversed.
 */
export function persistStoppedPractice(state: PracticeStopped, authState: AuthState): void {
  const trials = buildPersistedPracticeTrials(state.results, state.runId);
  appendPracticeTrials(trials);

  void sync(authState);
}
