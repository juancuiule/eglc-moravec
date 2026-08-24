import { createStore } from "zustand/vanilla";
import { createRandomOperation, Level } from "../level";
import {
  Operation,
  scoreAnswer,
  scoreTimeout,
  canShowHint,
  starsForScore,
  LEVEL_COMPLETE_THRESHOLD,
  type Keystroke,
  type Answering,
  type BaseTrialResult,
} from "engine";

export type { Keystroke, Answering };
export { LEVEL_COMPLETE_THRESHOLD };

// ─── Config ────────────────────────────────────────────────────────────────────

export type GameConfig = {
  levelNumber: number;
  level: Level;
  totalTrials: number; // always 20 for levelled play
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

export const TOTAL_TRIALS = 20;

// ─── Trial result ──────────────────────────────────────────────────────────────

export type TrialResult = BaseTrialResult & {
  streakAtSubmit: number;
  /** Hints left *before* this trial's own hint request (if any) — distinct from hintShown, which only says whether one was actually used. */
  hintsAvailableAtStart: number;
};

// A trial only consumes a slot when it's wrong, or correct-within-time.
// Correct-but-late = the player must retry the same slot.
export function trialCounts(result: TrialResult): boolean {
  return !(result.correct && result.timeExceeded);
}

// ─── Playing nested states ─────────────────────────────────────────────────────

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
  /** Identifies this one playthrough — generated fresh per attempt (including each Replay) — so its trials can be grouped back together after they're flattened into trial_results. */
  runId: string;
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
  runId: string;
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
  submitAnswer: (answer: number, keystrokes?: Keystroke[], hasErased?: boolean) => void;

  /**
   * Mark the current trial as timed out. `answer` is whatever was entered
   * into the calculator when the timer hit zero (or null if nothing was) —
   * still scored for correctness, not discarded.
   * Valid from: Playing › Answering
   */
  timeUp: (answer: number | null, keystrokes?: Keystroke[], hasErased?: boolean) => void;

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

/**
 * crypto.randomUUID() only exists in a secure context (HTTPS or
 * localhost) — this app is deployed self-hosted over plain HTTP on a LAN
 * (e.g. http://raspberrypi.local), where it's undefined. getRandomValues
 * has no such restriction, so build the UUID from that instead.
 */
function randomRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function startPlaying(config: GameConfig, trialId = 0): Playing {
  const seen = new Set<string>();
  const firstOp = createRandomOperation(config.level);
  seen.add(firstOp.humanReadable());
  return {
    type: "playing",
    config,
    runId: randomRunId(),
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function currentStreak(results: TrialResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].correct && !results[i].timeExceeded) streak++;
    else break;
  }
  return streak;
}

/**
 * Reconstructs the hint budget as it stood before this trial's own hint
 * request, if any — at most one hint can be requested per trial (see
 * requestHint's canShowHint gate), so undoing that single possible
 * decrement is enough; no separate snapshot needs to be threaded through.
 */
function computeHintsAvailableAtStart(hintsRemaining: number, hintShown: boolean): number {
  return hintsRemaining + (hintShown ? 1 : 0);
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

    submitAnswer(answer, keystrokes = [], hasErased = false) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const { startedAt } = state.playingState;
      const base = scoreAnswer(state.currentOperation, startedAt, answer, {
        keystrokes,
        hasErased,
        hintShown: state.hintVisible,
      });
      const result: TrialResult = {
        ...base,
        streakAtSubmit: currentStreak(state.results),
        hintsAvailableAtStart: computeHintsAvailableAtStart(state.hintsRemaining, state.hintVisible),
      };

      set({ state: { ...state, playingState: { type: "reviewing", result } } });
    },

    timeUp(answer, keystrokes = [], hasErased = false) {
      const { state } = get();
      if (state.type !== "playing") return;
      if (state.playingState.type !== "answering") return;

      const base = scoreTimeout(state.currentOperation, answer, {
        keystrokes,
        hasErased,
        hintShown: state.hintVisible,
      });
      const result: TrialResult = {
        ...base,
        streakAtSubmit: currentStreak(state.results),
        hintsAvailableAtStart: computeHintsAvailableAtStart(state.hintsRemaining, state.hintVisible),
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
            runId: state.runId,
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
      if (!canShowHint(state.hintVisible, state.currentOperation.hint().hasHint(), state.hintsRemaining)) return;

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
