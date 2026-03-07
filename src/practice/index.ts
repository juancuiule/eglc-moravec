import { createStore } from "zustand/vanilla";
import { createOperation } from "../operations";
import { Operation } from "../operations/operation";
import type { Answering, Reviewing } from "../game/index";

// ─── Config ────────────────────────────────────────────────────────────────────

export type PracticeConfig = {
  categoryCodename: string;
};

// ─── Trial result ──────────────────────────────────────────────────────────────

export type PracticeTrialResult = {
  operation: Operation;
  answer: number | null;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
};

// ─── States ────────────────────────────────────────────────────────────────────

export type PracticeIdle = { type: "idle" };

export type PracticePlaying = {
  type: "playing";
  config: PracticeConfig;
  currentOperation: Operation;
  trialId: number;
  results: PracticeTrialResult[];
  playingState: Answering | Reviewing;
};

export type PracticeStopped = {
  type: "stopped";
  config: PracticeConfig;
  results: PracticeTrialResult[];
};

export type PracticeState = PracticeIdle | PracticePlaying | PracticeStopped;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type PracticeStore = {
  state: PracticeState;

  /** Start a practice session for a category. */
  start: (config: PracticeConfig) => void;

  /** Submit an answer. Valid from: playing › answering. */
  submitAnswer: (answer: number) => void;

  /**
   * Time ran out. Valid from: playing › answering.
   * In practice, this is not penalised — just triggers review then advance.
   */
  timeUp: () => void;

  /** Advance to next trial. Valid from: playing › reviewing. */
  advance: () => void;

  /** Stop the session and show summary. Valid from: playing. */
  stop: () => void;

  /** Return to idle (dismiss summary). */
  reset: () => void;
};

// ─── Factory ───────────────────────────────────────────────────────────────────

function startPlaying(config: PracticeConfig, trialId = 0): PracticePlaying {
  return {
    type: "playing",
    config,
    currentOperation: createOperation(config.categoryCodename),
    trialId,
    results: [],
    playingState: { type: "answering", startedAt: Date.now() },
  };
}

export function createPracticeStore() {
  return createStore<PracticeStore>((set, get) => ({
    state: { type: "idle" },

    start(config) {
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

      const result: PracticeTrialResult = {
        operation: currentOperation,
        answer,
        correct,
        timeExceeded,
        timeTaken,
      };

      set({ state: { ...state, playingState: { type: "reviewing", result } } });
    },

    timeUp() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { currentOperation } = state;
      const result: PracticeTrialResult = {
        operation: currentOperation,
        answer: null,
        correct: false,
        timeExceeded: true,
        timeTaken: currentOperation.solveTime(),
      };

      set({ state: { ...state, playingState: { type: "reviewing", result } } });
    },

    advance() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "reviewing") return;

      const { result } = state.playingState;
      const results = [...state.results, result];

      set({
        state: {
          ...state,
          currentOperation: createOperation(state.config.categoryCodename),
          trialId: state.trialId + 1,
          results,
          playingState: { type: "answering", startedAt: Date.now() },
        },
      });
    },

    stop() {
      const { state } = get();
      if (state.type !== "playing") return;
      set({
        state: {
          type: "stopped",
          config: state.config,
          results: state.results,
        },
      });
    },

    reset() {
      set({ state: { type: "idle" } });
    },
  }));
}
