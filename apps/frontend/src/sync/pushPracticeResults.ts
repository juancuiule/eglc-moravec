import { toTrialResultInputs, type TrialResult } from "engine";
import { Api } from "../api/Api";

/**
 * Fire-and-forget Sync push for a stopped Practice session — mirrors
 * pushResults.ts's Level equivalent.
 */
export function pushPracticeResults(
  token: string,
  results: TrialResult[],
  runId: string,
): void {
  const payload = toTrialResultInputs(
    results,
    { runType: "practice", levelNumber: null, runId },
    Date.now(),
  );

  void Api.syncResults(token, payload).catch(() => {
    // best-effort; a failed sync never blocks or interrupts play
  });
}
