import { TrialResult, type TrialResultInput } from "engine";
import { Api } from "../api/Api";
import type { GameConfig } from "../game/index";
import { computePlayedAtTimestamps } from "../storage/playedAt";

/**
 * Fire-and-forget Sync push for a finished Level, calling Api.syncResults
 * directly (not through TanStack Query) — triggered by the game store's
 * state transition into Finished, not a component-rendered loading state.
 * There's no local trial history to build the payload from anymore (the
 * backend is the only store of record), so `id`/`playedAt` are derived
 * here instead. Never awaited by the caller — a slow or failed request
 * must never delay or interrupt play.
 */
export function pushResults(
  token: string,
  config: GameConfig,
  results: TrialResult[],
  runId: string,
): void {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );

  const payload: TrialResultInput[] = results.map((r, i) => ({
    id: crypto.randomUUID(),
    runType: "level",
    levelNumber: config.levelNumber,
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
