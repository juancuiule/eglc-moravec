import type { PracticeStopped } from "./index";
import { authStore, type AuthState } from "../auth/store";
import { pushPracticeResults } from "../sync/pushPracticeResults";

/**
 * Syncs a stopped Practice session to the backend for any session at all —
 * anonymous or logged in — mirroring persistFinishedLevel.ts's Level
 * equivalent. If the supplied snapshot is logged out, one anonymous-session
 * establishment attempt is made before giving up. Practice was local-only by
 * earlier design (see CONTEXT.md's Sync entry); that's since been reversed,
 * and there's no local fallback anymore either.
 */
export function persistStoppedPractice(
  state: PracticeStopped,
  authState: AuthState,
): void {
  if (authState.type !== "logged-out") {
    pushPracticeResults(authState.token, state.results, state.runId);
    return;
  }

  void authStore
    .getState()
    .ensureSessionToken()
    .then((token) => {
      if (token) pushPracticeResults(token, state.results, state.runId);
    });
}
