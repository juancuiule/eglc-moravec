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
    // The timer stops a trial at solveTime, but tick slop or a throttled tab
    // can land the measurement a few ms over. Cap at construction so the
    // live record badge, the outbox row, the pushed payload, and the
    // server's stored value all agree on the same duration — evaluate's
    // wire-side clamp then only matters for stale clients.
    const capped: BaseTrialResult = {
      ...base,
      timeTaken: Math.min(base.timeTaken, base.operation.solveTime()),
    };
    const { correct, timeExceeded } = Trial.evaluate(capped);
    return {
      ...capped,
      correct,
      timeExceeded,
    };
  },
  scoreAnswer: (
    base: Omit<BaseTrialResult, "timeTaken">,
    startedAt: number,
  ) => {
    // Clock rollbacks (NTP correction, manual change) would otherwise yield
    // a negative timeTaken — which then fails schema validation at enqueue
    // and silently deletes the trial from both the store and the sync push.
    const timeTaken = Math.max(0, Date.now() - startedAt);
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
