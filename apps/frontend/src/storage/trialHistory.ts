import type { GameConfig, TrialResult } from "../game/index";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { store } from "./store";

const TABLE = "trials";
const MAX_TRIALS = 2000;

export type PersistedTrial = {
  trialId: string;
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  /** Identifies which single playthrough this trial belongs to — see Playing/Finished's runId. */
  runId: string;
};

/** Map a finished level's trial results into the shape persisted to trial history. */
export function buildPersistedTrials(
  config: GameConfig,
  results: TrialResult[],
  runId: string,
): PersistedTrial[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );
  return results.map((r, i) => ({
    trialId: randomId(),
    levelNumber: config.levelNumber,
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt: new Date(playedAtTimestamps[i]).toISOString(),
    keystrokes: r.keystrokes,
    hintShown: r.hintShown,
    streakAtSubmit: r.streakAtSubmit,
    hintsAvailableAtStart: r.hintsAvailableAtStart,
    runId,
  }));
}

export function loadTrialHistory(): PersistedTrial[] {
  return store
    .getSortedRowIds(TABLE, "playedAt")
    .map((rowId) => store.getRow(TABLE, rowId))
    .filter((row) => row.runType === "level")
    .map((row) => ({
      trialId: row.trialId as string,
      levelNumber: row.levelNumber as number,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokesJson as string),
      hintShown: row.hintShown as boolean,
      streakAtSubmit: row.streakAtSubmit as number,
      hintsAvailableAtStart: row.hintsAvailableAtStart as number,
      runId: row.runId as string,
    }));
}

export function appendTrials(trials: PersistedTrial[]): void {
  if (trials.length === 0) return;
  trials.forEach((t) => {
    store.setRow(TABLE, t.trialId, {
      trialId: t.trialId,
      runType: "level",
      levelNumber: t.levelNumber,
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokesJson: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      streakAtSubmit: t.streakAtSubmit,
      hintsAvailableAtStart: t.hintsAvailableAtStart,
      runId: t.runId,
    });
  });
  evictOldest("level", MAX_TRIALS);
}

/** Deletes the oldest rows of the given runType beyond `max`, oldest (by playedAt) first. */
function evictOldest(runType: "level" | "practice", max: number): void {
  const ids = store
    .getSortedRowIds(TABLE, "playedAt")
    .filter((rowId) => store.getCell(TABLE, rowId, "runType") === runType);
  const excess = ids.length - max;
  if (excess <= 0) return;
  ids.slice(0, excess).forEach((rowId) => store.delRow(TABLE, rowId));
}
