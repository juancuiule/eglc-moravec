import {
  canShowHint,
  createOperation,
  Trial,
  TrialResult,
  type Answering,
  type Operation,
} from "engine";
import { createStore } from "zustand/vanilla";
import { randomId } from "../randomId";

export type { TrialResult };

export type PracticeConfig = {
  categoryCodename: string;
};

export type PracticeReviewing = {
  type: "reviewing";
  result: TrialResult;
};

export type PracticeIdle = { type: "idle" };

export type PracticePlaying = {
  type: "playing";
  config: PracticeConfig;
  runId: string;
  currentOperation: Operation;
  trialId: number;
  results: TrialResult[];
  playingState: Answering | PracticeReviewing;
  hintVisible: boolean;
};

export type PracticeStopped = {
  type: "stopped";
  config: PracticeConfig;
  runId: string;
  results: TrialResult[];
};

export type PracticeState = PracticeIdle | PracticePlaying | PracticeStopped;

export type PracticeStore = {
  state: PracticeState;
  start: (config: PracticeConfig) => void;
  submitAnswer: (answer: number) => void;
  timeUp: (answer: number | null) => void;
  advance: () => void;
  requestHint: () => void;
  stop: () => void;
  reset: () => void;
};

function startPlaying(config: PracticeConfig, trialId = 0): PracticePlaying {
  return {
    type: "playing",
    config,
    runId: randomId(),
    currentOperation: createOperation(config.categoryCodename),
    trialId,
    results: [],
    playingState: { type: "answering", startedAt: Date.now() },
    hintVisible: false,
  };
}

function toReviewing(
  state: PracticePlaying,
  result: TrialResult,
): PracticePlaying {
  return { ...state, playingState: { type: "reviewing", result } };
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
      const result: TrialResult = Trial.scoreAnswer(
        {
          operation: state.currentOperation,
          answer,
          hintShown: state.hintVisible,
        },
        startedAt,
      );

      set({ state: toReviewing(state, result) });
    },

    timeUp(answer) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const result: TrialResult = Trial.scoreTimeout({
        operation: state.currentOperation,
        answer,
        hintShown: state.hintVisible,
      });

      set({ state: toReviewing(state, result) });
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
          hintVisible: false,
        },
      });
    },

    requestHint() {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;
      if (
        !canShowHint(state.hintVisible, state.currentOperation.hint().hasHint())
      )
        return;
      set({ state: { ...state, hintVisible: true } });
    },

    stop() {
      const { state } = get();
      if (state.type !== "playing") return;
      set({
        state: {
          type: "stopped",
          config: state.config,
          runId: state.runId,
          results: state.results,
        },
      });
    },

    reset() {
      set({ state: { type: "idle" } });
    },
  }));
}
