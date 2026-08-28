import type { BaseTrialResult } from "engine";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { localStore } from "./store";

// No levelNumber — Practice trials aren't tied to a Level. Stored in the
// same underlying `trials` table as Level's PersistedTrial (storage/
// trialHistory.ts), discriminated by runType, but kept separate here per
// the grilling session: Practice and Level stats stay unmerged — that's a
// presentation decision, not a storage one.
export type PersistedPracticeTrial = {
  id: string;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
  hintShown: boolean;
  /** Identifies which single Practice session this trial belongs to — see PracticeStopped's runId. */
  runId: string;
};

/** Map a stopped Practice session's trial results into the shape persisted to Practice history. */
export function buildPersistedPracticeTrials(
  results: BaseTrialResult[],
  runId: string,
): PersistedPracticeTrial[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );
  return results.map((r, i) => ({
    id: randomId(),
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt: new Date(playedAtTimestamps[i]).toISOString(),
    keystrokes: r.keystrokes,
    hintShown: r.hintShown,
    runId,
  }));
}

/** Reads every Practice trial (runType "practice") from the shared `trials` table — Level trials live alongside but are filtered out. */
export function loadPracticeHistory(): PersistedPracticeTrial[] {
  const table = localStore.getTable("trials");
  return Object.values(table)
    .filter((row) => row.runType === "practice")
    .map((row) => ({
      id: row.id as string,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokes as string),
      hintShown: row.hintShown as boolean,
      runId: row.runId as string,
    }));
}

/**
 * Writes each trial into the shared `trials` table as unsynced — a later
 * sync push picks up anything with `synced: false`. No levelNumber,
 * streakAtSubmit, or hintsAvailableAtStart cells: PersistedPracticeTrial
 * doesn't carry them (streakAtSubmit in particular is only computable from
 * the full ordered session, retroactively, the same way pushPracticeResults
 * already does it — a sync-time concern, not a storage-time one).
 */
export function appendPracticeTrials(trials: PersistedPracticeTrial[]): void {
  trials.forEach((t) => {
    localStore.setRow("trials", t.id, {
      id: t.id,
      runType: "practice",
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokes: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      runId: t.runId,
      synced: false,
    });
  });
}
