import type { GameConfig, TrialResult } from "../game/index";

const STORAGE_KEY = "moravec:trialHistory";
const MAX_TRIALS = 2000;

export type PersistedTrial = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
};

/** Map a finished level's trial results into the shape persisted to trial history. */
export function buildPersistedTrials(
  config: GameConfig,
  results: TrialResult[],
): PersistedTrial[] {
  const playedAt = new Date().toISOString();
  return results.map((r) => ({
    levelNumber: config.levelNumber,
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt,
    keystrokes: r.keystrokes,
  }));
}

export function loadTrialHistory(): PersistedTrial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PersistedTrial[];
  } catch {
    return [];
  }
}

export function appendTrials(trials: PersistedTrial[]): void {
  if (trials.length === 0) return;
  try {
    const existing = loadTrialHistory();
    const combined = [...existing, ...trials];
    const capped = combined.length > MAX_TRIALS
      ? combined.slice(combined.length - MAX_TRIALS)
      : combined;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // storage quota exceeded — silently ignore
  }
}
