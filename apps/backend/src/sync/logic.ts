import { reconstructOperation, evaluateTrial, starsForScore, LEVEL_COMPLETE_THRESHOLD } from "engine";
import type { TrialResultRow, LevelRunRow } from "./repo.js";

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
  id: string; // client-generated — the dedup key for idempotent inserts
  levelNumber: number | null;
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
  runId: string;
  runType: "level" | "practice";
};

function isTrialResultInput(value: unknown): value is TrialResultInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    (r.levelNumber === null || typeof r.levelNumber === "number") &&
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
    typeof r.runId === "string" &&
    (r.runType === "level" || r.runType === "practice")
  );
}

/** Parses and validates a sync request body; null means the body was malformed. */
export function parseTrialResults(body: unknown): TrialResultInput[] | null {
  if (typeof body !== "object" || body === null) return null;
  const trials = (body as { trials?: unknown }).trials;
  if (!Array.isArray(trials)) return null;
  return trials.every(isTrialResultInput) ? trials : null;
}

export type SyncRequest = {
  cursor: number;
  trials: TrialResultInput[];
};

/**
 * Parses and validates a full POST /sync request body — `cursor` plus the
 * same trials shape `parseTrialResults` validates. `levelRuns` is
 * deliberately not part of this shape: the server always re-derives level
 * runs from the trials in the same batch (see deriveLevelRuns), never
 * trusting a client-submitted run summary directly.
 */
export function parseSyncRequest(body: unknown): SyncRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const cursor = (body as { cursor?: unknown }).cursor;
  if (typeof cursor !== "number" || cursor < 0) return null;

  const trials = parseTrialResults(body);
  if (trials === null) return null;

  return { cursor, trials };
}

export type EvaluatedTrialResult = {
  id: string;
  levelNumber: number | null;
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
  runId: string;
  runType: "level" | "practice";
};

/**
 * Independently re-derives correctness/timing from a trial's own reported
 * operands/answer/timeTaken, using packages/engine — the same scoring rules
 * the client itself uses. A disagreement with the client's claim is never an
 * error: both are returned, and the caller stores both (see CONTEXT.md's
 * "backend independently re-validates trial correctness" entry).
 */
export function evaluateTrialResult(input: TrialResultInput): EvaluatedTrialResult {
  const operation = reconstructOperation(input.categoryCodename, input.operands);
  const { correct, timeExceeded } = evaluateTrial(operation, input.answer, input.timeTaken);

  return {
    id: input.id,
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
    runId: input.runId,
    runType: input.runType,
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
    byRun.set(t.runId, [...(byRun.get(t.runId) ?? []), t]);
  });

  return Array.from(byRun.entries()).map(([levelRunId, runTrials]) => {
    const correctCount = runTrials.filter((t) => t.correct).length;
    const totalTime = runTrials.reduce((sum, t) => sum + t.timeTaken, 0);
    return {
      levelRunId,
      // Non-null: the caller (routes/sync.ts) only ever passes the
      // runType === "level" subset here, which always carries a real
      // levelNumber — levelNumber is number | null only to accommodate
      // Practice trials, which never reach this function.
      levelNumber: runTrials[0].levelNumber!,
      stars: starsForScore(correctCount),
      totalTime,
      levelCompleted: correctCount >= LEVEL_COMPLETE_THRESHOLD,
    };
  });
}

export type SyncLogEntry = {
  seq: number;
  entityType: "trial_result" | "level_run";
  entityId: string;
};

export type SyncResponsePlan = {
  trialIdsToFetch: string[];
  levelRunIdsToFetch: string[];
  newCursor: number;
};

/**
 * Decides what a POST /sync response should send back, from the raw
 * sync_log entries newer than the requesting device's cursor. `pushedTrialIds`/
 * `pushedLevelRunIds` are this same request's own push — excluded from what's
 * fetched so a device never gets its own just-pushed data echoed back, purely
 * to save bandwidth (including them would still be correct, since applying
 * them again is idempotent). The cursor advances past every entry seen,
 * excluded or not — otherwise the next sync would re-ask for the same
 * already-known entries forever.
 */
export function buildSyncResponsePlan(
  log: readonly SyncLogEntry[],
  cursor: number,
  pushedTrialIds: ReadonlySet<string>,
  pushedLevelRunIds: ReadonlySet<string>,
): SyncResponsePlan {
  const trialIdsToFetch = log
    .filter((e) => e.entityType === "trial_result" && !pushedTrialIds.has(e.entityId))
    .map((e) => e.entityId);
  const levelRunIdsToFetch = log
    .filter((e) => e.entityType === "level_run" && !pushedLevelRunIds.has(e.entityId))
    .map((e) => e.entityId);
  const newCursor = log.reduce((max, e) => Math.max(max, e.seq), cursor);

  return { trialIdsToFetch, levelRunIdsToFetch, newCursor };
}

export type SyncTrialOutput = {
  id: string;
  runType: "level" | "practice";
  levelNumber: number | null;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: number;
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  runId: string;
};

/**
 * Maps a stored trial row to the shape a POST /sync pull response sends
 * down. Omits keystrokes (research-signal storage, never read locally) and
 * the client_correct/client_time_exceeded audit columns (meaningful only
 * server-side) — a pulled trial only ever needs the server's authoritative
 * correct/timeExceeded. The Practice level_number sentinel (0) is mapped
 * back to null, matching the shape a client originally pushed.
 */
export function toWireTrial(row: TrialResultRow): SyncTrialOutput {
  return {
    id: row.id,
    runType: row.run_type as "level" | "practice",
    levelNumber: row.run_type === "practice" ? null : row.level_number,
    categoryCodename: row.category_codename,
    correct: row.correct === 1,
    timeExceeded: row.time_exceeded === 1,
    timeTaken: row.time_taken,
    playedAt: row.played_at,
    hintShown: row.hint_shown === 1,
    streakAtSubmit: row.streak_at_submit,
    hintsAvailableAtStart: row.hints_available_at_start,
    runId: row.run_id,
  };
}

export type SyncLevelRunOutput = {
  id: string;
  levelNumber: number;
  stars: number;
  totalTime: number;
  levelCompleted: boolean;
  playedAt: number;
};

export function toWireLevelRun(row: LevelRunRow): SyncLevelRunOutput {
  return {
    id: row.id,
    levelNumber: row.level_number,
    stars: row.stars,
    totalTime: row.total_time,
    levelCompleted: row.level_completed === 1,
    playedAt: row.played_at,
  };
}
