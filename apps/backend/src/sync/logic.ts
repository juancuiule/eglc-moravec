import { reconstructOperation, evaluateTrial, starsForScore, LEVEL_COMPLETE_THRESHOLD } from "engine";

export type KeystrokeInput = {
  key: string;
  t: number;
};

function isKeystrokeInput(value: unknown): value is KeystrokeInput {
  if (typeof value !== "object" || value === null) return false;
  const k = value as Record<string, unknown>;
  return typeof k.key === "string" && typeof k.t === "number";
}

export type TrialResultInput = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean; // client-submitted claim
  timeExceeded: boolean; // client-submitted claim
  timeTaken: number;
  playedAt: number;
  keystrokes: KeystrokeInput[];
  operands: number[];
  answer: number | null;
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  levelRunId: string;
};

function isTrialResultInput(value: unknown): value is TrialResultInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.levelNumber === "number" &&
    typeof r.categoryCodename === "string" &&
    typeof r.correct === "boolean" &&
    typeof r.timeExceeded === "boolean" &&
    typeof r.timeTaken === "number" &&
    typeof r.playedAt === "number" &&
    Array.isArray(r.keystrokes) &&
    r.keystrokes.every(isKeystrokeInput) &&
    Array.isArray(r.operands) &&
    r.operands.every((o) => typeof o === "number") &&
    (r.answer === null || typeof r.answer === "number") &&
    typeof r.hintShown === "boolean" &&
    typeof r.streakAtSubmit === "number" &&
    typeof r.hintsAvailableAtStart === "number" &&
    typeof r.levelRunId === "string"
  );
}

/** Parses and validates a sync request body; null means the body was malformed. */
export function parseTrialResults(body: unknown): TrialResultInput[] | null {
  if (typeof body !== "object" || body === null) return null;
  const trials = (body as { trials?: unknown }).trials;
  if (!Array.isArray(trials)) return null;
  return trials.every(isTrialResultInput) ? trials : null;
}

export type EvaluatedTrialResult = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean; // server-computed (authoritative)
  timeExceeded: boolean; // server-computed (authoritative)
  clientCorrect: boolean; // original client claim, kept for auditing
  clientTimeExceeded: boolean; // original client claim, kept for auditing
  timeTaken: number;
  playedAt: number;
  keystrokes: KeystrokeInput[];
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  levelRunId: string;
};

/**
 * Independently re-derives correctness/timing from a trial's own reported
 * operands/answer/timeTaken, using packages/engine — the same scoring rules
 * the client itself uses. A disagreement with the client's claim is never an
 * error: both are returned, and the caller stores both (see ADR-0005).
 */
export function evaluateTrialResult(input: TrialResultInput): EvaluatedTrialResult {
  const operation = reconstructOperation(input.categoryCodename, input.operands);
  const { correct, timeExceeded } = evaluateTrial(operation, input.answer, input.timeTaken);

  return {
    levelNumber: input.levelNumber,
    categoryCodename: input.categoryCodename,
    correct,
    timeExceeded,
    clientCorrect: input.correct,
    clientTimeExceeded: input.timeExceeded,
    timeTaken: input.timeTaken,
    playedAt: input.playedAt,
    keystrokes: input.keystrokes,
    hintShown: input.hintShown,
    streakAtSubmit: input.streakAtSubmit,
    hintsAvailableAtStart: input.hintsAvailableAtStart,
    levelRunId: input.levelRunId,
  };
}

export type LevelRunSummary = {
  levelRunId: string;
  levelNumber: number;
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
  levelCompleted: boolean;
};

/**
 * Derive each individual level-run's outcome (stars/totalTime/completed)
 * from a batch of validated trials, grouped by levelRunId rather than
 * levelNumber — a batch is expected to carry exactly one run today (one
 * POST /sync/results call per finished Level), but grouping by the run's
 * own id rather than assuming that shape is what actually makes each run's
 * record correct even if that assumption ever stops holding. Stars/
 * completion use the server's own recomputed correctness (packages/engine's
 * starsForScore/LEVEL_COMPLETE_THRESHOLD), never the client's claim.
 */
export function deriveLevelRuns(trials: readonly EvaluatedTrialResult[]): LevelRunSummary[] {
  const byRun = new Map<string, EvaluatedTrialResult[]>();
  trials.forEach((t) => {
    byRun.set(t.levelRunId, [...(byRun.get(t.levelRunId) ?? []), t]);
  });

  return Array.from(byRun.entries()).map(([levelRunId, runTrials]) => {
    const correctInTime = runTrials.filter((t) => t.correct && !t.timeExceeded).length;
    const totalTime = runTrials.reduce((sum, t) => sum + t.timeTaken, 0);
    return {
      levelRunId,
      levelNumber: runTrials[0].levelNumber,
      stars: starsForScore(correctInTime),
      totalTime,
      levelCompleted: correctInTime >= LEVEL_COMPLETE_THRESHOLD,
    };
  });
}

/**
 * A record is better if it has more stars, or the same stars in less time —
 * mirrors the frontend's LevelStats comparison (storage/levelStats.ts).
 */
export function isBetterLevelRecord(
  candidate: { stars: number; totalTime: number },
  existing: { stars: number; totalTime: number } | null,
): boolean {
  if (existing === null) return true;
  if (candidate.stars > existing.stars) return true;
  return candidate.stars === existing.stars && candidate.totalTime < existing.totalTime;
}
