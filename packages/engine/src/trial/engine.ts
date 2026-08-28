import { Operation } from "../operations/operation";

export type Answering = {
  type: "answering";
  startedAt: number;
};

export type BaseTrialResult = {
  operation: Operation;
  answer: number | null; // null = timed out
  timeTaken: number; // ms
  hintShown: boolean;
};

export type TrialResult = BaseTrialResult & {
  correct: boolean;
  timeExceeded: boolean;
};

export const Trial = {
  evaluate: ({ answer, operation, timeTaken }: BaseTrialResult) => {
    return {
      correct: answer !== null && answer === operation.result(),
      timeExceeded: timeTaken >= operation.solveTime(),
    };
  },
  build: (base: BaseTrialResult) => {
    const { correct, timeExceeded } = Trial.evaluate(base);
    return {
      ...base,
      correct,
      timeExceeded,
    };
  },
  scoreAnswer: (
    base: Omit<BaseTrialResult, "timeTaken">,
    startedAt: number,
  ) => {
    const timeTaken = Date.now() - startedAt;
    const scoredBase: BaseTrialResult = { ...base, timeTaken };
    return Trial.build(scoredBase);
  },
  scoreTimeout: (base: Omit<BaseTrialResult, "timeTaken">) => {
    const timeTaken = base.operation.solveTime();
    const scoredBase: BaseTrialResult = { ...base, timeTaken };
    return Trial.build(scoredBase);
  },
};

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
