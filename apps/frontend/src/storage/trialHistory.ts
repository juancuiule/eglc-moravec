import type { GameConfig, TrialResult } from "../game/index";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { localStore } from "./store";

export type PersistedTrial = {
  id: string;
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
    id: randomId(),
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

/** Reads every Level trial (runType "level") from the shared `trials` table — Practice trials live alongside but are filtered out. */
export function loadTrialHistory(): PersistedTrial[] {
  const table = localStore.getTable("trials");
  return Object.values(table)
    .filter((row) => row.runType === "level")
    .map((row) => ({
      id: row.id as string,
      levelNumber: row.levelNumber as number,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokes as string),
      hintShown: row.hintShown as boolean,
      streakAtSubmit: row.streakAtSubmit as number,
      hintsAvailableAtStart: row.hintsAvailableAtStart as number,
      runId: row.runId as string,
    }));
}

/** Writes each trial into the shared `trials` table as unsynced — a later sync push picks up anything with `synced: false`. */
export function appendTrials(trials: PersistedTrial[]): void {
  trials.forEach((t) => {
    localStore.setRow("trials", t.id, {
      id: t.id,
      runType: "level",
      levelNumber: t.levelNumber,
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokes: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      streakAtSubmit: t.streakAtSubmit,
      hintsAvailableAtStart: t.hintsAvailableAtStart,
      runId: t.runId,
      synced: false,
    });
  });
}
