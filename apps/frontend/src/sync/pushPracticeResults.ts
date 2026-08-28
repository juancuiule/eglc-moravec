import type { TrialResult } from "../practice/index";
import { Api, type SyncTrial } from "../api/Api";
import { computePlayedAtTimestamps } from "../storage/playedAt";

/**
 * Fire-and-forget Sync push for a stopped Practice session — mirrors
 * pushResults.ts's Level equivalent.
 */
export function pushPracticeResults(
  token: string,
  results: TrialResult[],
  runId: string,
): void {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );

  const payload: SyncTrial[] = results.map((r, i) => ({
    id: crypto.randomUUID(),
    runType: "practice",
    levelNumber: null,
    categoryCodename: r.operation.categoryCodename(),
    operands: r.operation.operands(),
    answer: r.answer,
    timeTaken: r.timeTaken,
    playedAt: playedAtTimestamps[i],
    hintShown: r.hintShown,
    runId,
  }));

  void Api.syncResults(token, payload).catch(() => {
    // best-effort; a failed sync never blocks or interrupts play
  });
}
