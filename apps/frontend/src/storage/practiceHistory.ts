import type { BaseTrialResult } from "engine";
import { computePlayedAtTimestamps } from "./playedAt";

const STORAGE_KEY = "moravec:practiceHistory";
const MAX_TRIALS = 2000;

// No levelNumber — Practice trials aren't tied to a Level. Kept as a
// separate history from Level's PersistedTrial (storage/trialHistory.ts)
// per the grilling session: Practice and Level stats stay unmerged.
export type PersistedPracticeTrial = {
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
};

/** Map a stopped Practice session's trial results into the shape persisted to Practice history. */
export function buildPersistedPracticeTrials(
  results: BaseTrialResult[],
): PersistedPracticeTrial[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );
  return results.map((r, i) => ({
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt: new Date(playedAtTimestamps[i]).toISOString(),
    keystrokes: r.keystrokes,
  }));
}

export function loadPracticeHistory(): PersistedPracticeTrial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PersistedPracticeTrial[];
  } catch {
    return [];
  }
}

export function appendPracticeTrials(trials: PersistedPracticeTrial[]): void {
  if (trials.length === 0) return;
  try {
    const existing = loadPracticeHistory();
    const combined = [...existing, ...trials];
    const capped =
      combined.length > MAX_TRIALS ? combined.slice(combined.length - MAX_TRIALS) : combined;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // storage quota exceeded — silently ignore
  }
}
