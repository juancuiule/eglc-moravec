import type { PersistedTrial } from "../storage/trialHistory";
import type { TrialResult } from "../game/index";
import { API_URL } from "../apiUrl";

/**
 * Fire-and-forget Sync push for a finished Level. `trials` is the already-built
 * PersistedTrial[] (the same ones passed to appendTrials, so playedAt matches
 * what's stored locally instead of a second, independently-generated
 * timestamp); `results` is the original TrialResult[] it was built from, in
 * the same order, used only to add operands/answer to the wire payload —
 * verifiable data not kept in local storage (see ADR — ticket 04). Never
 * awaited by the caller — a slow or failed request must never delay or
 * interrupt play.
 */
export function pushResults(token: string, results: TrialResult[], trials: PersistedTrial[]): void {
  const payload = trials.map((t, i) => ({
    levelNumber: t.levelNumber,
    categoryCodename: t.categoryCodename,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
    timeTaken: t.timeTaken,
    playedAt: new Date(t.playedAt).getTime(), // backend stores epoch ms, not ISO
    keystrokes: t.keystrokes,
    operands: results[i].operation.operands(),
    answer: results[i].answer,
  }));

  void fetch(`${API_URL}/sync/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ trials: payload }),
  }).catch(() => {
    // best-effort; a failed sync never blocks or interrupts play
  });
}
