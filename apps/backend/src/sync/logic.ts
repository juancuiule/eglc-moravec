import { reconstructOperation, evaluateTrial, starsForScore } from "engine";

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
    typeof r.hintsAvailableAtStart === "number"
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
  };
}

export type LevelStatsSummary = {
  levelNumber: number;
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
};

/**
 * Derive each finished Level's stars/totalTime from a batch of validated
 * trials, using the same threshold rule the client uses
 * (packages/engine's starsForScore) — but applied to the server's own
 * recomputed correctness, not the client's claim. In practice one
 * POST /sync/results call carries exactly one Level's trials; trials are
 * grouped by levelNumber regardless, so a mixed batch is still scored
 * correctly per Level.
 */
export function deriveLevelStats(trials: readonly EvaluatedTrialResult[]): LevelStatsSummary[] {
  const byLevel = new Map<number, EvaluatedTrialResult[]>();
  trials.forEach((t) => {
    byLevel.set(t.levelNumber, [...(byLevel.get(t.levelNumber) ?? []), t]);
  });

  return Array.from(byLevel.entries()).map(([levelNumber, levelTrials]) => {
    const correctInTime = levelTrials.filter((t) => t.correct && !t.timeExceeded).length;
    const totalTime = levelTrials.reduce((sum, t) => sum + t.timeTaken, 0);
    return { levelNumber, stars: starsForScore(correctInTime), totalTime };
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
