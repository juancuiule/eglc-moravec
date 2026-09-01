import {
  canShowHint,
  Trial,
  type Answering,
  type Operation,
  type TrialResult,
} from "engine";
import { createStore } from "zustand/vanilla";
import { randomId } from "../randomId";

export type Reviewing = {
  type: "reviewing";
  result: TrialResult;
};

export type PlayingState = Answering | Reviewing;

export type Idle = { type: "idle" };

export type Playing<TConfig, TPickState> = {
  type: "playing";
  config: TConfig;
  runId: string;
  results: TrialResult[];
  currentOperation: Operation;
  pickState: TPickState;
  trialId: number; // monotonically increasing, used to reset UI between trials
  playingState: PlayingState;
  hintVisible: boolean;
  hintsRemaining: number | undefined; // undefined = unlimited
};

// TTerminal is constrained to a tagged type (never "idle" or "playing" in
// practice — Level uses "finished", Practice uses "stopped") so the union
// below can be narrowed with plain `type` checks, and so isPlaying/isIdle
// below can be written as proper type guards instead of unsafe casts.
export type TrialSessionState<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
> = Idle | Playing<TConfig, TPickState> | TTerminal;

/**
 * What varies between a Level and a Practice session: how the next
 * Operation is picked, whether hints are budgeted, when the session
 * completes on its own (via advance), and what its terminal state looks
 * like. Everything else — Answering/Reviewing, scoring, hint gating — is
 * the same machine for both.
 */
export type TrialSessionPolicy<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
> = {
  initialHintsRemaining: (config: TConfig) => number | undefined;
  initialPickState: (config: TConfig) => TPickState;
  pickNext: (
    config: TConfig,
    pickState: TPickState,
  ) => { operation: Operation; pickState: TPickState };
  isComplete: (results: TrialResult[], config: TConfig) => boolean;
  buildTerminalState: (
    results: TrialResult[],
    config: TConfig,
    runId: string,
  ) => TTerminal;
};

export type TrialSessionStore<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
> = {
  state: TrialSessionState<TConfig, TTerminal, TPickState>;
  start: (config: TConfig) => void;
  submitAnswer: (answer: number) => void;
  timeUp: (answer: number | null) => void;
  advance: () => void;
  requestHint: () => void;
  forceComplete: () => void;
  reset: () => void;
};

function isPlaying<TConfig, TTerminal extends { type: string }, TPickState>(
  state: TrialSessionState<TConfig, TTerminal, TPickState>,
): state is Playing<TConfig, TPickState> {
  return state.type === "playing";
}

function startPlaying<TConfig, TTerminal extends { type: string }, TPickState>(
  policy: TrialSessionPolicy<TConfig, TTerminal, TPickState>,
  config: TConfig,
): Playing<TConfig, TPickState> {
  const { operation, pickState } = policy.pickNext(
    config,
    policy.initialPickState(config),
  );
  return {
    type: "playing",
    config,
    runId: randomId(),
    results: [],
    currentOperation: operation,
    pickState,
    trialId: 0,
    playingState: { type: "answering", startedAt: Date.now() },
    hintVisible: false,
    hintsRemaining: policy.initialHintsRemaining(config),
  };
}

function toReviewing<TConfig, TPickState>(
  state: Playing<TConfig, TPickState>,
  result: TrialResult,
): Playing<TConfig, TPickState> {
  return { ...state, playingState: { type: "reviewing", result } };
}

type Setter<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
> = (partial: {
  state: TrialSessionState<TConfig, TTerminal, TPickState>;
}) => void;
type Getter<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
> = () => TrialSessionStore<TConfig, TTerminal, TPickState>;

/**
 * The action implementations alone, without `state` or a `createStore`
 * wrapper — exposed so a caller that needs one extra action of its own
 * (Practice's `stop`) can compose it into a single zustand store alongside
 * these, rather than nesting two stores (which would break reactivity: the
 * extra action needs to `set` on the exact store components subscribe to).
 */
export function trialSessionActions<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
>(
  policy: TrialSessionPolicy<TConfig, TTerminal, TPickState>,
  set: Setter<TConfig, TTerminal, TPickState>,
  get: Getter<TConfig, TTerminal, TPickState>,
): Omit<TrialSessionStore<TConfig, TTerminal, TPickState>, "state"> {
  return {
    start(config) {
      const { state } = get();
      if (isPlaying(state)) return;
      set({ state: startPlaying(policy, config) });
    },

    submitAnswer(answer) {
      const { state } = get();
      if (!isPlaying(state)) return;
      if (state.playingState.type !== "answering") return;

      const { startedAt } = state.playingState;
      const result = Trial.scoreAnswer(
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
      if (!isPlaying(state)) return;
      if (state.playingState.type !== "answering") return;

      const result = Trial.scoreTimeout({
        operation: state.currentOperation,
        answer,
        hintShown: state.hintVisible,
      });

      set({ state: toReviewing(state, result) });
    },

    advance() {
      const { state } = get();
      if (!isPlaying(state)) return;
      if (state.playingState.type !== "reviewing") return;

      const { result } = state.playingState;
      const results = [...state.results, result];

      if (policy.isComplete(results, state.config)) {
        set({
          state: policy.buildTerminalState(results, state.config, state.runId),
        });
      } else {
        const { operation, pickState } = policy.pickNext(
          state.config,
          state.pickState,
        );
        set({
          state: {
            ...state,
            currentOperation: operation,
            pickState,
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
      if (!isPlaying(state)) return;
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
          hintsRemaining:
            state.hintsRemaining === undefined
              ? undefined
              : state.hintsRemaining - 1,
        },
      });
    },

    forceComplete() {
      const { state } = get();
      if (!isPlaying(state)) return;
      set({
        state: policy.buildTerminalState(
          state.results,
          state.config,
          state.runId,
        ),
      });
    },

    reset() {
      set({ state: { type: "idle" } });
    },
  };
}

export function createTrialSessionStore<
  TConfig,
  TTerminal extends { type: string },
  TPickState,
>(policy: TrialSessionPolicy<TConfig, TTerminal, TPickState>) {
  return createStore<TrialSessionStore<TConfig, TTerminal, TPickState>>(
    (set, get) => ({
      state: { type: "idle" },
      ...trialSessionActions(policy, set, get),
    }),
  );
}
