import type { BaseTrialResult } from "engine";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { store } from "./store";

const TABLE = "trials";
const MAX_TRIALS = 2000;

// No levelNumber — Practice trials aren't tied to a Level. Kept as a
// separate type from Level's PersistedTrial (storage/trialHistory.ts) per
// the grilling session: Practice and Level stats stay unmerged — even
// though, as of this change, both now live in the same underlying table.
export type PersistedPracticeTrial = {
  trialId: string;
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
    trialId: randomId(),
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

export function loadPracticeHistory(): PersistedPracticeTrial[] {
  return store
    .getSortedRowIds(TABLE, "playedAt")
    .map((rowId) => store.getRow(TABLE, rowId))
    .filter((row) => row.runType === "practice")
    .map((row) => ({
      trialId: row.trialId as string,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokesJson as string),
      hintShown: row.hintShown as boolean,
      runId: row.runId as string,
    }));
}

export function appendPracticeTrials(trials: PersistedPracticeTrial[]): void {
  if (trials.length === 0) return;
  trials.forEach((t) => {
    store.setRow(TABLE, t.trialId, {
      trialId: t.trialId,
      runType: "practice",
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokesJson: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      runId: t.runId,
    });
  });
  evictOldestPractice(MAX_TRIALS);
}

function evictOldestPractice(max: number): void {
  const ids = store
    .getSortedRowIds(TABLE, "playedAt")
    .filter((rowId) => store.getCell(TABLE, rowId, "runType") === "practice");
  const excess = ids.length - max;
  if (excess <= 0) return;
  ids.slice(0, excess).forEach((rowId) => store.delRow(TABLE, rowId));
}
