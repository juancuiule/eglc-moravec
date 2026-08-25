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

/**
 * Wire shape of one Trial pushed via RxDB's push-replication protocol (see
 * apps/frontend/src/sync/trialResults). `id` is the client-generated
 * primary key, used as the dedup key for a retried push.
 * `clientCorrect`/`clientTimeExceeded` are the player's own claim; the
 * incoming `correct`/`timeExceeded` fields (the client's own optimistic
 * mirror of that claim) are intentionally not read here at all — they get
 * fully replaced by this module's own recomputation regardless of what the
 * client sent.
 */
export type TrialResultPushInput = {
  id: string;
  levelNumber: number;
  categoryCodename: string;
  clientCorrect: boolean;
  clientTimeExceeded: boolean;
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

function isTrialResultPushInput(value: unknown): value is TrialResultPushInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.levelNumber === "number" &&
    typeof r.categoryCodename === "string" &&
    typeof r.clientCorrect === "boolean" &&
    typeof r.clientTimeExceeded === "boolean" &&
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

/** Parses and validates a push-replication request body; null means the body was malformed. */
export function parseTrialResultPushes(body: unknown): TrialResultPushInput[] | null {
  if (typeof body !== "object" || body === null) return null;
  const trials = (body as { trials?: unknown }).trials;
  if (!Array.isArray(trials)) return null;
  return trials.every(isTrialResultPushInput) ? trials : null;
}

export type EvaluatedTrialResult = {
  id: string;
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
 * error: both are returned, and the caller stores both (see CONTEXT.md's
 * "backend independently re-validates trial correctness" entry).
 */
export function evaluateTrialResult(input: TrialResultPushInput): EvaluatedTrialResult {
  const operation = reconstructOperation(input.categoryCodename, input.operands);
  const { correct, timeExceeded } = evaluateTrial(operation, input.answer, input.timeTaken);

  return {
    id: input.id,
    levelNumber: input.levelNumber,
    categoryCodename: input.categoryCodename,
    correct,
    timeExceeded,
    clientCorrect: input.clientCorrect,
    clientTimeExceeded: input.clientTimeExceeded,
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
 * levelNumber — a batch is expected to carry exactly one run's trials (one
 * finished Level pushed together as a single bulk write), grouped by the
 * run's own id rather than assumed positionally. This does NOT protect
 * against a single run's trials arriving split across two separate push
 * calls (e.g. an offline backlog large enough to exceed the client's push
 * batchSize) — insertLevelRuns' INSERT OR IGNORE means whichever call
 * arrives first permanently commits its (possibly partial) outcome; see its
 * own comment in sync/repo.ts. Stars/completion use the server's own
 * recomputed correctness (packages/engine's starsForScore/
 * LEVEL_COMPLETE_THRESHOLD), never the client's claim.
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
