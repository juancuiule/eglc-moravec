import { createStore } from "zustand/vanilla";
import { randomId } from "../randomId";
import {
  createOperation,
  type Operation,
  scoreAnswer,
  scoreTimeout,
  canShowHint,
  type Answering,
  type Keystroke,
  type BaseTrialResult,
} from "engine";

// ─── Config ────────────────────────────────────────────────────────────────────

export type PracticeConfig = {
  categoryCodename: string;
};

// ─── Trial result ──────────────────────────────────────────────────────────────

export type PracticeTrialResult = BaseTrialResult;

// ─── States ────────────────────────────────────────────────────────────────────

export type PracticeReviewing = {
  type: "reviewing";
  result: PracticeTrialResult;
};

export type PracticeIdle = { type: "idle" };

export type PracticePlaying = {
  type: "playing";
  config: PracticeConfig;
  runId: string;
  currentOperation: Operation;
  trialId: number;
  results: PracticeTrialResult[];
  playingState: Answering | PracticeReviewing;
  hintVisible: boolean;
};

export type PracticeStopped = {
  type: "stopped";
  config: PracticeConfig;
  runId: string;
  results: PracticeTrialResult[];
};

export type PracticeState = PracticeIdle | PracticePlaying | PracticeStopped;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type PracticeStore = {
  state: PracticeState;

  /** Start a practice session for a category. */
  start: (config: PracticeConfig) => void;

  /** Submit an answer. Valid from: playing › answering. */
  submitAnswer: (answer: number, keystrokes?: Keystroke[], hasErased?: boolean) => void;

  /**
   * Time ran out. Valid from: playing › answering.
   * In practice, this is not penalised — just triggers review then advance.
   * `answer` is whatever was entered when the timer hit zero (or null),
   * still scored for correctness, not discarded.
   */
  timeUp: (answer: number | null, keystrokes?: Keystroke[], hasErased?: boolean) => void;

  /** Advance to next trial. Valid from: playing › reviewing. */
  advance: () => void;

  /** Show the hint for the current trial (unlimited in practice). Valid from: playing › answering. */
  requestHint: () => void;

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
    runId: randomId(),
    currentOperation: createOperation(config.categoryCodename),
    trialId,
    results: [],
    playingState: { type: "answering", startedAt: Date.now() },
    hintVisible: false,
  };
}

function toReviewing(state: PracticePlaying, result: PracticeTrialResult): PracticePlaying {
  return { ...state, playingState: { type: "reviewing", result } };
}

export function createPracticeStore() {
  return createStore<PracticeStore>((set, get) => ({
    state: { type: "idle" },

    start(config) {
      set({ state: startPlaying(config) });
    },

    submitAnswer(answer, keystrokes = [], hasErased = false) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { startedAt } = state.playingState;
      const result: PracticeTrialResult = scoreAnswer(state.currentOperation, startedAt, answer, {
        keystrokes,
        hasErased,
        hintShown: state.hintVisible,
      });

      set({ state: toReviewing(state, result) });
    },

    timeUp(answer, keystrokes = [], hasErased = false) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const result: PracticeTrialResult = scoreTimeout(state.currentOperation, answer, {
        keystrokes,
        hasErased,
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
      if (!canShowHint(state.hintVisible, state.currentOperation.hint().hasHint())) return;
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
