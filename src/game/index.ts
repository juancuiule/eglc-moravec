import { createStore } from "zustand/vanilla";
import { createRandomOperation, Level } from "../level";
import { Operation } from "../operations/operation";

// ─── Config ────────────────────────────────────────────────────────────────────

export type GameConfig = {
  levelNumber: number;
  level: Level;
  totalTrials: number; // always 20 for levelled play
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

export const LEVEL_COMPLETE_THRESHOLD = 15;
export const TOTAL_TRIALS = 20;

export function starsForScore(correctInTime: number): 0 | 1 | 2 | 3 {
  if (correctInTime >= 20) return 3;
  if (correctInTime >= 17) return 2;
  if (correctInTime >= 15) return 1;
  return 0;
}

// ─── Trial result ──────────────────────────────────────────────────────────────

export type TrialResult = {
  operation: Operation;
  answer: number | null; // null = timed out
  correct: boolean;
  timeExceeded: boolean; // true if timeTaken > operation.solveTime()
  timeTaken: number; // ms
  hintShown: boolean;
};

// A trial only consumes a slot when it's wrong, or correct-within-time.
// Correct-but-late = the player must retry the same slot.
export function trialCounts(result: TrialResult): boolean {
  return !(result.correct && result.timeExceeded);
}

// ─── Playing nested states ─────────────────────────────────────────────────────

export type Answering = {
  type: "answering";
  startedAt: number;
};

export type Reviewing = {
  type: "reviewing";
  result: TrialResult;
};

export type PlayingState = Answering | Reviewing;

// ─── Top-level states ──────────────────────────────────────────────────────────

export type Loading = { type: "loading" };

export const HINTS_PER_LEVEL = 3;

export type Playing = {
  type: "playing";
  config: GameConfig;
  currentOperation: Operation; // current trial's operation
  seenOperations: Set<string>; // humanReadable() strings shown this level
  trialsConsumed: number;       // slots used: increments on wrong + correct-in-time
  trialId: number;              // monotonically increasing, used to reset UI between trials
  results: TrialResult[];       // all submitted results
  playingState: PlayingState;
  hintsRemaining: number;
  hintVisible: boolean;
};

export type Finished = {
  type: "finished";
  config: GameConfig;
  results: TrialResult[];
  correctInTime: number;
  levelCompleted: boolean; // correctInTime >= LEVEL_COMPLETE_THRESHOLD
  stars: 0 | 1 | 2 | 3;
};

export type GameState = Loading | Playing | Finished;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type GameStore = {
  state: GameState;

  /**
   * Start a level. Valid from: Loading, Finished.
   */
  load: (config: GameConfig) => void;

  /**
   * Submit an answer for the current operation.
   * Valid from: Playing › Answering
   */
  submitAnswer: (answer: number) => void;

  /**
   * Mark the current trial as timed out.
   * Valid from: Playing › Answering
   */
  timeUp: () => void;

  /**
   * Advance after the result is shown.
   * Valid from: Playing › Reviewing
   */
  advance: () => void;

  /**
   * Show the hint for the current trial (costs one hint if not yet shown this trial).
   * Valid from: Playing › Answering
   */
  requestHint: () => void;

  /**
   * Replay the same level immediately.
   * Valid from: Finished
   */
  replay: () => void;

  /**
   * Return to level selection.
   */
  reset: () => void;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pickFreshOperation(level: Level, seen: Set<string>): Operation {
  for (let i = 0; i < 50; i++) {
    const op = createRandomOperation(level);
    if (!seen.has(op.humanReadable())) return op;
  }
  // Fallback: all (or nearly all) combinations exhausted
  return createRandomOperation(level);
}

function startPlaying(config: GameConfig, trialId = 0): Playing {
  const seen = new Set<string>();
  const firstOp = createRandomOperation(config.level);
  seen.add(firstOp.humanReadable());
  return {
    type: "playing",
    config,
    currentOperation: firstOp,
    seenOperations: seen,
    trialsConsumed: 0,
    trialId,
    results: [],
    playingState: { type: "answering", startedAt: Date.now() },
    hintsRemaining: HINTS_PER_LEVEL,
    hintVisible: false,
  };
}

// ─── Factory ───────────────────────────────────────────────────────────────────

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
      const { currentOperation } = state;
      const timeTaken = Date.now() - startedAt;
      const correct = answer === currentOperation.result();
      const timeExceeded = timeTaken > currentOperation.solveTime();

      const result: TrialResult = {
        operation: currentOperation,
        answer,
        correct,
        timeExceeded,
        timeTaken,
        hintShown: state.hintVisible,
      };

      set({ state: { ...state, playingState: { type: "reviewing", result } } });
    },

    timeUp() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { currentOperation } = state;
      const result: TrialResult = {
        operation: currentOperation,
        answer: null,
        correct: false,
        timeExceeded: true,
        timeTaken: currentOperation.solveTime(),
        hintShown: state.hintVisible,
      };

      set({ state: { ...state, playingState: { type: "reviewing", result } } });
    },

    advance() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "reviewing") return;

      const { result } = state.playingState;
      const results = [...state.results, result];
      const newTrialsConsumed =
        state.trialsConsumed + (trialCounts(result) ? 1 : 0);

      if (newTrialsConsumed >= state.config.totalTrials) {
        const correctInTime = results.filter(
          (r) => r.correct && !r.timeExceeded,
        ).length;
        set({
          state: {
            type: "finished",
            config: state.config,
            results,
            correctInTime,
            levelCompleted: correctInTime >= LEVEL_COMPLETE_THRESHOLD,
            stars: starsForScore(correctInTime),
          },
        });
      } else {
        const nextOp = pickFreshOperation(state.config.level, state.seenOperations);
        const newSeen = new Set(state.seenOperations);
        newSeen.add(nextOp.humanReadable());
        set({
          state: {
            ...state,
            currentOperation: nextOp,
            seenOperations: newSeen,
            trialsConsumed: newTrialsConsumed,
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
      if (!state.currentOperation.hint().hasHint()) return;
      if (state.hintVisible) return; // already showing

      const cost = state.hintsRemaining > 0 ? 1 : 0;
      if (cost === 0 && state.hintsRemaining === 0) return; // no hints left

      set({
        state: {
          ...state,
          hintVisible: true,
          hintsRemaining: state.hintsRemaining - cost,
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
