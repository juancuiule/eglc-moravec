import { Operation } from "../operations/operation.js";

// ─── Shared trial types ─────────────────────────────────────────────────────────
// Used by both the level game (game/index.ts) and practice mode (practice/index.ts).

export type Keystroke = { key: string; t: number };

export type Answering = {
  type: "answering";
  startedAt: number;
};

export type BaseTrialResult = {
  operation: Operation;
  answer: number | null; // null = timed out
  correct: boolean;
  timeExceeded: boolean; // true if timeTaken > operation.solveTime()
  timeTaken: number; // ms
  hintShown: boolean;
  keystrokes: Keystroke[];
  hasErased: boolean;
};

export type TrialInputs = {
  keystrokes?: Keystroke[];
  hasErased?: boolean;
  hintShown: boolean;
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Independently derive correctness/timing from an operation, a submitted
 * answer, and a known duration — no clock reads involved. Used by
 * `scoreAnswer` for live client-side play, and by the backend to
 * re-validate a client-submitted trial from its reported timeTaken.
 */
export function evaluateTrial(
  operation: Operation,
  answer: number | null,
  timeTaken: number,
): { correct: boolean; timeExceeded: boolean } {
  return {
    correct: answer !== null && answer === operation.result(),
    timeExceeded: timeTaken > operation.solveTime(),
  };
}

/** Score a submitted answer against an operation, given when the trial started. */
export function scoreAnswer(
  operation: Operation,
  startedAt: number,
  answer: number,
  inputs: TrialInputs,
): BaseTrialResult {
  const timeTaken = Date.now() - startedAt;
  const { correct, timeExceeded } = evaluateTrial(operation, answer, timeTaken);

  return {
    operation,
    answer,
    correct,
    timeExceeded,
    timeTaken,
    hintShown: inputs.hintShown,
    keystrokes: inputs.keystrokes ?? [],
    hasErased: inputs.hasErased ?? false,
  };
}

/** Score a trial whose timer ran out before an answer was submitted. */
export function scoreTimeout(
  operation: Operation,
  inputs: TrialInputs,
): BaseTrialResult {
  return {
    operation,
    answer: null,
    correct: false,
    timeExceeded: true,
    timeTaken: operation.solveTime(),
    hintShown: inputs.hintShown,
    keystrokes: inputs.keystrokes ?? [],
    hasErased: inputs.hasErased ?? false,
  };
}

// ─── Hint visibility ───────────────────────────────────────────────────────────

/**
 * Whether a hint can be shown right now.
 * Pass `hintsRemaining` for a finite budget (level game); omit it for unlimited hints (practice).
 */
export function canShowHint(
  hintVisible: boolean,
  hasHint: boolean,
  hintsRemaining?: number,
): boolean {
  if (!hasHint) return false;
  if (hintVisible) return false;
  if (hintsRemaining !== undefined && hintsRemaining <= 0) return false;
  return true;
}
