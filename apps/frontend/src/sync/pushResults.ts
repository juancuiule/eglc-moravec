import { toTrialResultInputs, type TrialResult } from "engine";
import { Api } from "../api/Api";

/**
 * Fire-and-forget Sync push for a finished Level, calling Api.syncResults
 * directly (not through TanStack Query) — triggered by the game store's
 * state transition into Finished, not a component-rendered loading state.
 * There's no local trial history to build the payload from anymore (the
 * backend is the only store of record), so `id`/`playedAt` are derived
 * here instead. Never awaited by the caller — a slow or failed request
 * must never delay or interrupt play.
 *
 * Returns a promise (always resolving, push failures are swallowed here as
 * before) so a caller that wants to chain something onto "the push has
 * actually landed" — see persistFinishedLevel.ts — can, without forcing
 * every other caller to await it.
 */
export function pushResults(
  token: string,
  levelNumber: number,
  results: TrialResult[],
  runId: string,
): Promise<void> {
  const payload = toTrialResultInputs(
    results,
    { runType: "level", levelNumber, runId },
    Date.now(),
  );

  return Api.syncResults(token, payload).then(
    () => undefined,
    () => {
      // best-effort; a failed sync never blocks or interrupts play
    },
  );
}
