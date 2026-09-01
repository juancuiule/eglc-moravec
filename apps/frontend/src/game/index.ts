import {
  LEVEL_COMPLETE_THRESHOLD,
  starsForScore,
  type Operation,
  type TrialResult,
} from "engine";
import type { StoreApi } from "zustand/vanilla";
import { createRandomOperation, type Level } from "../level";
import {
  createTrialSessionStore,
  type Playing as TrialSessionPlaying,
  type TrialSessionPolicy,
  type TrialSessionStore,
} from "../trialSession";

export type GameConfig = {
  levelNumber: number;
  level: Level;
  totalTrials: number; // always TRIALS_PER_LEVEL for levelled play
};

export const HINTS_PER_LEVEL = 3;

export type Finished = {
  type: "finished";
  config: GameConfig;
  runId: string;
  results: TrialResult[];
  correctCount: number;
  levelCompleted: boolean; // correctCount >= LEVEL_COMPLETE_THRESHOLD
  stars: 0 | 1 | 2 | 3;
};

// humanReadable() strings of Operations already shown this Level, so the
// same Operation never repeats within a run.
type SeenOperations = Set<string>;

// hintsRemaining narrowed to a definite number — Level's policy always
// provides one, unlike Practice's genuinely-unlimited undefined.
export type Playing = Omit<
  TrialSessionPlaying<GameConfig, SeenOperations>,
  "hintsRemaining"
> & { hintsRemaining: number };

export type GameState = { type: "idle" } | Playing | Finished;

// forceComplete is intentionally not part of Level's surface — there's no
// manual early-exit concept for a Level (see Practice's stop()).
export type GameStore = Omit<
  TrialSessionStore<GameConfig, Finished, SeenOperations>,
  "state" | "forceComplete"
> & { state: GameState };

function pickFreshOperation(level: Level, seen: SeenOperations): Operation {
  for (let i = 0; i < 50; i++) {
    const op = createRandomOperation(level);
    if (!seen.has(op.humanReadable())) return op;
  }

  return createRandomOperation(level);
}

export const policy: TrialSessionPolicy<GameConfig, Finished, SeenOperations> =
  {
    initialHintsRemaining: () => HINTS_PER_LEVEL,
    initialPickState: () => new Set(),
    pickNext: (config, seen) => {
      const operation = pickFreshOperation(config.level, seen);
      const nextSeen = new Set(seen);
      nextSeen.add(operation.humanReadable());
      return { operation, pickState: nextSeen };
    },
    isComplete: (results, config) => results.length >= config.totalTrials,
    buildTerminalState: (results, config, runId) => {
      const correctCount = results.filter((r) => r.correct).length;
      return {
        type: "finished",
        config,
        runId,
        results,
        correctCount,
        levelCompleted: correctCount >= LEVEL_COMPLETE_THRESHOLD,
        stars: starsForScore(correctCount),
      };
    },
  };

export function createGameStore(): StoreApi<GameStore> {
  // Level's policy guarantees hintsRemaining is always a number and never
  // exposes forceComplete — both true at runtime, just not expressible to
  // the generic factory itself. See Playing/GameStore above.
  return createTrialSessionStore(policy) as unknown as StoreApi<GameStore>;
}
