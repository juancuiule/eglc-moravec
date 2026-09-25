export {
  categoryFromCodename,
  isSupportedCategoryCodename,
  operandsMatchCategory,
  SUPPORTED_CATEGORY_CODENAMES,
  type AdditionCategory,
  type MultiplicationCategory,
  type OperationCategory,
  type SquaringCategory,
  type SupportedCategoryCodename,
} from "./operations/category";
export { createOperation, reconstructOperation } from "./operations/index";
export { createRandomOperand, type OperandOptions } from "./operations/operand";
export {
  Addition,
  Multiplication,
  Operation,
  Squaring,
} from "./operations/operation";

export type { Hint } from "./operations/hints/Hint";
export { MultiplicationHint } from "./operations/hints/MultiplicationHint";
export { NoHint } from "./operations/hints/NoHint";
export { SquaringHint } from "./operations/hints/SquaringHint";

export {
  canShowHint,
  Trial,
  type BaseTrialResult,
  type TrialResult,
  type Answering,
} from "./trial/engine";

export {
  MAX_DATE_TIMESTAMP,
  MAX_SYNC_TRIALS,
  TrialResultSchema,
  TrialResultsSchema,
  evaluateTrialResult,
  toTrialResultInputs,
  deriveLevelStats,
  type LevelStats,
  type TrialResultInput,
  type TrialResultPolicy,
  type EvaluatedTrialResult,
} from "./logic";

export {
  isBetterLevelRecord,
  LEVEL_COMPLETE_THRESHOLD,
  starsForScore,
  SEED_LEVEL_COUNT,
  TRIALS_PER_LEVEL,
  type LevelRecordCandidate,
} from "./levelScoring";

export { getKeys, getValues, math } from "./utils";
