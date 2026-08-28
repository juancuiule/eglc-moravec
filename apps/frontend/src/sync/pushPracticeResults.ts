import type { PersistedPracticeTrial } from "../storage/practiceHistory";
import type { PracticeTrialResult } from "../practice/index";
import { currentStreak } from "engine";
import { Api, type SyncTrial } from "../api/Api";

/**
 * Fire-and-forget Sync push for a stopped Practice session — mirrors
 * pushResults.ts's Level equivalent. streakAtSubmit is computed
 * retroactively here from the final results array (Practice has no live
 * streak-tracking during play, unlike Level's game/index.ts); see the
 * shared currentStreak helper in engine.
 */
export function pushPracticeResults(
  token: string,
  results: PracticeTrialResult[],
  trials: PersistedPracticeTrial[],
): void {
  const payload: SyncTrial[] = trials.map((t, i) => ({
    runType: "practice",
    levelNumber: null,
    categoryCodename: t.categoryCodename,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
    timeTaken: t.timeTaken,
    playedAt: new Date(t.playedAt).getTime(),
    keystrokes: t.keystrokes,
    operands: results[i].operation.operands(),
    answer: results[i].answer,
    hintShown: t.hintShown,
    streakAtSubmit: currentStreak(results.slice(0, i)),
    hintsAvailableAtStart: 0, // Practice hints are unlimited — no budget to report
    runId: t.runId,
    trialId: t.trialId,
  }));

  void Api.syncResults(token, payload).catch(() => {
    // best-effort; a failed sync never blocks or interrupts play
  });
}
