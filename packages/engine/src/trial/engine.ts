import { Operation } from "../operations/operation";

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
    // >= , not >: a timeout always reports timeTaken === solveTime() exactly
    // (see scoreTimeout below), so a strict > would never flag it as exceeded.
    timeExceeded: timeTaken >= operation.solveTime(),
  };
}

function buildTrialResult(
  operation: Operation,
  answer: number | null,
  timeTaken: number,
  inputs: TrialInputs,
): BaseTrialResult {
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

/** Score a submitted answer against an operation, given when the trial started. */
export function scoreAnswer(
  operation: Operation,
  startedAt: number,
  answer: number,
  inputs: TrialInputs,
): BaseTrialResult {
  return buildTrialResult(operation, answer, Date.now() - startedAt, inputs);
}

/**
 * Score a trial whose timer ran out before the player pressed Submit.
 * `answer` is whatever was entered into the calculator at that moment (or
 * null if nothing was) — still evaluated for correctness, not discarded,
 * since a correct-but-late entry is a real, distinct outcome from a
 * genuinely wrong one.
 */
export function scoreTimeout(
  operation: Operation,
  answer: number | null,
  inputs: TrialInputs,
): BaseTrialResult {
  return buildTrialResult(operation, answer, operation.solveTime(), inputs);
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
  return (
    hasHint &&
    !hintVisible &&
    (hintsRemaining === undefined || hintsRemaining > 0)
  );
}
