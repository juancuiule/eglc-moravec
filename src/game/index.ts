import { createStore } from "zustand/vanilla";
import { createRandomOperation, Level } from "../level";
import { Operation } from "../operations/operation";

// ─── Config ────────────────────────────────────────────────────────────────────

export type GameConfig = {
  level: Level;
  nTrials: number;
};

// ─── Trial result ──────────────────────────────────────────────────────────────

export type TrialResult = {
  operation: Operation;
  answer: number | null; // null means timed out
  correct: boolean;
  timeTaken: number; // ms
};

// ─── Playing nested states ─────────────────────────────────────────────────────

export type Answering = {
  type: "answering";
  startedAt: number; // Date.now() when trial began
};

export type Reviewing = {
  type: "reviewing";
  result: TrialResult;
};

export type PlayingState = Answering | Reviewing;

// ─── Top-level states ──────────────────────────────────────────────────────────

// Initial state: waiting for load() to be called with a config
export type Loading = { type: "loading" };

// Active game: holds all mutable trial state
export type Playing = {
  type: "playing";
  config: GameConfig;
  operations: Operation[];
  currentTrial: number;       // index into operations[]
  results: TrialResult[];     // completed trial results
  playingState: PlayingState; // nested state machine
};

// Terminal state: all trials completed
export type Finished = {
  type: "finished";
  config: GameConfig;
  operations: Operation[];
  results: TrialResult[];
};

export type GameState = Loading | Playing | Finished;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type GameStore = {
  state: GameState;

  /**
   * Generate operations and start the game.
   * Valid from: Loading
   */
  load: (config: GameConfig) => void;

  /**
   * Submit an answer for the current operation.
   * Valid from: Playing › Answering
   */
  submitAnswer: (answer: number) => void;

  /**
   * Mark the current trial as timed out (no answer given).
   * Valid from: Playing › Answering
   */
  timeUp: () => void;

  /**
   * Advance from the result screen to the next trial, or finish the game.
   * Valid from: Playing › Reviewing
   */
  advance: () => void;

  /**
   * Reset back to the loading state to start a new game.
   */
  reset: () => void;
};

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createGameStore() {
  return createStore<GameStore>((set, get) => ({
    state: { type: "loading" },

    load(config) {
      const { state } = get();
      if (state.type !== "loading") return;

      const operations: Operation[] = Array.from({ length: config.nTrials }, () =>
        createRandomOperation(config.level),
      );

      set({
        state: {
          type: "playing",
          config,
          operations,
          currentTrial: 0,
          results: [],
          playingState: { type: "answering", startedAt: Date.now() },
        },
      });
    },

    submitAnswer(answer) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { startedAt } = state.playingState;
      const operation = state.operations[state.currentTrial];
      const timeTaken = Date.now() - startedAt;
      const correct = answer === operation.result();

      const result: TrialResult = { operation, answer, correct, timeTaken };

      set({
        state: {
          ...state,
          playingState: { type: "reviewing", result },
        },
      });
    },

    timeUp() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const operation = state.operations[state.currentTrial];
      const result: TrialResult = {
        operation,
        answer: null,
        correct: false,
        timeTaken: operation.solveTime(),
      };

      set({
        state: {
          ...state,
          playingState: { type: "reviewing", result },
        },
      });
    },

    reset() {
      set({ state: { type: "loading" } });
    },

    advance() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "reviewing") return;

      const results = [...state.results, state.playingState.result];
      const nextTrial = state.currentTrial + 1;
      const isLastTrial = nextTrial >= state.operations.length;

      if (isLastTrial) {
        set({
          state: {
            type: "finished",
            config: state.config,
            operations: state.operations,
            results,
          },
        });
      } else {
        set({
          state: {
            ...state,
            currentTrial: nextTrial,
            results,
            playingState: { type: "answering", startedAt: Date.now() },
          },
        });
      }
    },
  }));
}
