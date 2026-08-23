// The shared domain model — Operations, Trial scoring, Level completion.
// Used by both apps/frontend (gameplay) and apps/backend (independent
// server-side verification of what a client reports). See ADR-0001.

export { Operation, Addition, Multiplication, Squaring } from "./operations/operation";
export {
  categoryFromCodename,
  type OperationCategory,
  type AdditionCategory,
  type MultiplicationCategory,
  type SquaringCategory,
} from "./operations/category";
export { createRandomOperand, type OperandOptions } from "./operations/operand";
export { createOperation, reconstructOperation } from "./operations/index";

export type { Hint } from "./operations/hints/Hint";
export { NoHint } from "./operations/hints/NoHint";
export { MultiplicationHint } from "./operations/hints/MultiplicationHint";
export { SquaringHint } from "./operations/hints/SquaringHint";

export {
  scoreAnswer,
  scoreTimeout,
  evaluateTrial,
  canShowHint,
  type Keystroke,
  type Answering,
  type BaseTrialResult,
  type TrialInputs,
} from "./trial/engine";

export { starsForScore, LEVEL_COMPLETE_THRESHOLD } from "./levelScoring";

export { math, getKeys, getValues } from "./utils";
