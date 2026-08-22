// The shared domain model — Operations, Trial scoring, Level completion.
// Used by both apps/frontend (gameplay) and apps/backend (independent
// server-side verification of what a client reports). See ADR-0001.

export { Operation, Addition, Multiplication, Squaring } from "./operations/operation.js";
export {
  categoryFromCodename,
  type OperationCategory,
  type AdditionCategory,
  type MultiplicationCategory,
  type SquaringCategory,
} from "./operations/category.js";
export { createRandomOperand, type OperandOptions } from "./operations/operand.js";
export { createOperation, reconstructOperation, operations } from "./operations/index.js";

export type { Hint } from "./operations/hints/Hint.js";
export { NoHint } from "./operations/hints/NoHint.js";
export { MultiplicationHint } from "./operations/hints/MultiplicationHint.js";
export { SquaringHint } from "./operations/hints/SquaringHint.js";

export {
  scoreAnswer,
  scoreTimeout,
  evaluateTrial,
  canShowHint,
  type Keystroke,
  type Answering,
  type BaseTrialResult,
  type TrialInputs,
} from "./trial/engine.js";

export { starsForScore, LEVEL_COMPLETE_THRESHOLD } from "./levelScoring.js";

export { math, getKeys, getValues } from "./utils.js";
