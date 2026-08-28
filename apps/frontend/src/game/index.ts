import {
  canShowHint,
  LEVEL_COMPLETE_THRESHOLD,
  Operation,
  starsForScore,
  Trial,
  TRIALS_PER_LEVEL,
  type Answering,
  type TrialResult,
} from "engine";
import { createStore } from "zustand/vanilla";
import { createRandomOperation, Level } from "../level";
import { randomId } from "../randomId";

export type GameConfig = {
  levelNumber: number;
  level: Level;
  totalTrials: number; // always TRIALS_PER_LEVEL for levelled play
};

export type Reviewing = {
  type: "reviewing";
  result: TrialResult;
};

export type PlayingState = Answering | Reviewing;

export type Loading = { type: "loading" };

export const HINTS_PER_LEVEL = 3;

export type Playing = CommonState & {
  type: "playing";

  currentOperation: Operation; // current trial's operation
  seenOperations: Set<string>; // humanReadable() strings shown this level
  trialId: number; // monotonically increasing, used to reset UI between trials

  playingState: PlayingState;
  hintsRemaining: number;
  hintVisible: boolean;
};

type CommonState = {
  config: GameConfig;
  runId: string;
  results: TrialResult[];
};

export type Finished = CommonState & {
  type: "finished";
  correctCount: number;
  levelCompleted: boolean; // correctCount >= LEVEL_COMPLETE_THRESHOLD
  stars: 0 | 1 | 2 | 3;
};

export type GameState = Loading | Playing | Finished;

export type GameStore = {
  state: GameState;
  load: (config: GameConfig) => void;
  submitAnswer: (answer: number) => void;
  timeUp: (answer: number | null) => void;
  advance: () => void;
  requestHint: () => void;
  replay: () => void;
  reset: () => void;
};

function pickFreshOperation(level: Level, seen: Set<string>): Operation {
  for (let i = 0; i < 50; i++) {
    const op = createRandomOperation(level);
    if (!seen.has(op.humanReadable())) return op;
  }

  return createRandomOperation(level);
}

function startPlaying(config: GameConfig, trialId = 0): Playing {
  const seen = new Set<string>();
  const firstOp = createRandomOperation(config.level);
  seen.add(firstOp.humanReadable());
  return {
    type: "playing",
    config,
    runId: randomId(),
    currentOperation: firstOp,
    seenOperations: seen,
    trialId,
    results: [],
    playingState: { type: "answering", startedAt: Date.now() },
    hintsRemaining: HINTS_PER_LEVEL,
    hintVisible: false,
  };
}

function toReviewing(state: Playing, result: TrialResult): Playing {
  return {
    ...state,
    playingState: { type: "reviewing", result },
  };
}

export function createGameStore() {
  return createStore<GameStore>((set, get) => ({
    state: { type: "loading" },

    load(config) {
      const { state } = get();
      if (state.type !== "loading" && state.type !== "finished") return;
      set({ state: startPlaying(config) });
    },

    submitAnswer(answer) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { startedAt } = state.playingState;
      const base = Trial.scoreAnswer(
        {
          operation: state.currentOperation,
          answer,
          hintShown: state.hintVisible,
        },
        startedAt,
      );

      set({ state: toReviewing(state, base) });
    },

    timeUp(answer) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const base = Trial.scoreTimeout({
        operation: state.currentOperation,
        answer,
        hintShown: state.hintVisible,
      });

      set({ state: toReviewing(state, base) });
    },

    advance() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "reviewing") return;

      const { result } = state.playingState;
      const results = [...state.results, result];

      if (results.length >= state.config.totalTrials) {
        const correctCount = results.filter((r) => r.correct).length;
        set({
          state: {
            type: "finished",
            config: state.config,
            runId: state.runId,
            results,
            correctCount,
            levelCompleted: correctCount >= LEVEL_COMPLETE_THRESHOLD,
            stars: starsForScore(correctCount),
          },
        });
      } else {
        const nextOp = pickFreshOperation(
          state.config.level,
          state.seenOperations,
        );
        const newSeen = new Set(state.seenOperations);
        newSeen.add(nextOp.humanReadable());
        set({
          state: {
            ...state,
            currentOperation: nextOp,
            seenOperations: newSeen,
            trialId: state.trialId + 1,
            results,
            playingState: { type: "answering", startedAt: Date.now() },
            hintVisible: false,
          },
        });
      }
    },

    requestHint() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;
      if (
        !canShowHint(
          state.hintVisible,
          state.currentOperation.hint().hasHint(),
          state.hintsRemaining,
        )
      )
        return;

      set({
        state: {
          ...state,
          hintVisible: true,
          hintsRemaining: state.hintsRemaining - 1,
        },
      });
    },

    replay() {
      const { state } = get();
      if (state.type !== "finished") return;
      set({ state: startPlaying(state.config) });
    },

    reset() {
      set({ state: { type: "loading" } });
    },
  }));
}
