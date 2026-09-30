import {
  isBetterLevelRecord,
  LEVEL_COMPLETE_THRESHOLD,
  starsForScore,
  TRIALS_PER_LEVEL,
} from "./levelScoring";
import { reconstructOperation } from "./operations/index";
import {
  isSupportedCategoryCodename,
  operandsMatchCategory,
} from "./operations/category";
import { computePlayedAtTimestamps } from "./playedAt";
import { Trial, type TrialResult } from "./trial/engine";
import { groupBy } from "./utils";
import * as z from "zod";

export const MAX_SYNC_TRIALS = 1000;
export const MAX_DATE_TIMESTAMP = 8.64e15;

// One lifetime, three consumers: the backend session row's expires_at, the
// frontend cookie's max-age, and the account stash's TTL all derive from
// this so they can't drift apart.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TrialResultFields = {
  id: z.uuidv4(),
  runId: z.uuidv4(),
  categoryCodename: z.string().refine(isSupportedCategoryCodename),
  timeTaken: z.number().finite().int().nonnegative(),
  playedAt: z.number().finite().int().nonnegative().max(MAX_DATE_TIMESTAMP),
  operands: z.array(z.number()),
  answer: z.number().nullable(),
  hintShown: z.boolean(),
};

export const TrialResultSchema = z
  .discriminatedUnion("runType", [
    z.object({
      ...TrialResultFields,
      runType: z.literal("level"),
      // Positive safe integer, no catalog maximum: the active catalog is a
      // navigation concern, while synced Trials may reference Levels that no
      // longer exist in it (historical/offline runs).
      levelNumber: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    }),
    z.object({
      ...TrialResultFields,
      runType: z.literal("practice"),
      levelNumber: z.null(),
    }),
  ])
  .refine(({ categoryCodename, operands }) =>
    operandsMatchCategory(categoryCodename, operands),
  );

export const TrialResultsSchema = z.object({
  trials: z.array(TrialResultSchema).max(MAX_SYNC_TRIALS),
});

export type TrialResultInput = z.infer<typeof TrialResultSchema>;

// POST /sync — the unified push+pull request. `cursor` is the highest
// sync_log.seq this device has seen for its user, 0 on first contact; it
// must be a plain non-negative integer (Number.isInteger rejects
// NaN/Infinity — a malformed cursor must fail the request, not silently
// widen or narrow the pull window).
export const SyncRequestSchema = z.object({
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  trials: z.array(TrialResultSchema).max(MAX_SYNC_TRIALS),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResponse = { cursor: number; trials: SyncedTrial[] };

// The pull-side wire shape (GET /sync/trials): a stored trial plus the
// server's evaluation. Clients validate every pulled row against this
// before it enters their local read model — a malformed response must not
// persist as truth. Deliberately NOT TrialResultSchema: that one enforces
// today's playable catalog (supported category, operands matching it),
// which is a rule for new submissions. Historical rows may reference
// categories since retired — still valid research data, and computeStats
// already renders them — so an unknown codename is accepted as-is. A
// codename that IS still supported keeps its operand rules: today's rules
// are the only ones we can check, and a supported-category row that breaks
// them is malformed, not historical.
const SyncedTrialFields = {
  ...TrialResultFields,
  categoryCodename: z.string().min(1),
  correct: z.boolean(),
  timeExceeded: z.boolean(),
};

export const SyncedTrialSchema = z
  .discriminatedUnion("runType", [
    z.object({
      ...SyncedTrialFields,
      runType: z.literal("level"),
      levelNumber: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    }),
    z.object({
      ...SyncedTrialFields,
      runType: z.literal("practice"),
      levelNumber: z.null(),
    }),
  ])
  .refine(
    ({ categoryCodename, operands }) =>
      !isSupportedCategoryCodename(categoryCodename) ||
      operandsMatchCategory(categoryCodename, operands),
  );

export type SyncedTrial = z.infer<typeof SyncedTrialSchema>;

export type TrialResultPolicy =
  | { runType: "level"; levelNumber: number; runId: string }
  | { runType: "practice"; levelNumber: null; runId: string };

export function toTrialResultInputs(
  results: TrialResult[],
  policy: TrialResultPolicy,
  now: number,
  generateId: () => string = () => crypto.randomUUID(),
): TrialResultInput[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    now,
  );

  return results.map((r, i) => {
    const trial = {
      id: generateId(),
      categoryCodename: r.operation.categoryCodename(),
      operands: r.operation.operands(),
      answer: r.answer,
      timeTaken: r.timeTaken,
      playedAt: playedAtTimestamps[i],
      hintShown: r.hintShown,
      runId: policy.runId,
    };
    return policy.runType === "level"
      ? { ...trial, runType: "level", levelNumber: policy.levelNumber }
      : { ...trial, runType: "practice", levelNumber: null };
  });
}

export type EvaluatedTrialResult = TrialResultInput & {
  correct: boolean; // server-computed (authoritative)
  timeExceeded: boolean; // server-computed (authoritative)
};

export function evaluateTrialResult(
  input: TrialResultInput,
): EvaluatedTrialResult {
  const operation = reconstructOperation(
    input.categoryCodename,
    input.operands,
  );
  // A real client can never exceed the solve-time cap — a timeout reports
  // exactly solveTime — so a larger claimed duration is clamped rather than
  // stored verbatim (a client clock jump would otherwise pollute every
  // timing aggregate it flows into).
  const timeTaken = Math.min(input.timeTaken, operation.solveTime());
  const { correct, timeExceeded } = Trial.evaluate({
    operation,
    answer: input.answer,
    timeTaken,
    hintShown: input.hintShown,
  });

  return { ...input, timeTaken, correct, timeExceeded };
}

export type LevelRunSummary = {
  levelRunId: string;
  levelNumber: number;
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
  levelCompleted: boolean;
  playedAt: number;
};

export type TrialForLevelRun = {
  levelNumber: number | null;
  correct: boolean;
  timeTaken: number;
  playedAt: number;
  runId: string;
  runType: string;
};

export function deriveLevelRuns(
  trials: readonly TrialForLevelRun[],
): LevelRunSummary[] {
  const byRun = groupBy(trials, (t) => t.runId);

  return Array.from(byRun.entries()).flatMap(([levelRunId, runTrials]) => {
    const levelNumber = runTrials[0].levelNumber;
    if (
      runTrials.length > TRIALS_PER_LEVEL ||
      levelNumber === null ||
      !Number.isSafeInteger(levelNumber) ||
      levelNumber < 1 ||
      runTrials.some(
        (trial) =>
          trial.levelNumber !== levelNumber ||
          trial.runType !== "level" ||
          !Number.isInteger(trial.timeTaken) ||
          trial.timeTaken < 0 ||
          !Number.isInteger(trial.playedAt) ||
          trial.playedAt < 0 ||
          trial.playedAt > MAX_DATE_TIMESTAMP,
      )
    ) {
      return [];
    }

    const correctCount = runTrials.filter((t) => t.correct).length;
    const totalTime = runTrials.reduce((sum, t) => sum + t.timeTaken, 0);
    return [
      {
        levelRunId,
        levelNumber,
        stars: starsForScore(correctCount),
        totalTime,
        levelCompleted: correctCount >= LEVEL_COMPLETE_THRESHOLD,
        playedAt: Math.max(...runTrials.map((t) => t.playedAt)),
      },
    ];
  });
}

export type LevelStats = {
  levelNumber: number;
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
  completedAt: number;
};

// The /sync/level-stats wire shape: keyed by level number, completedAt as an
// ISO string rather than engine's epoch-ms. Both the backend serializer and
// the frontend's local read model convert through levelStatsToWire so the
// two sides can't drift.
export type LevelStatsWire = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number;
  completedAt: string; // ISO date
};

export function levelStatsToWire(
  stats: readonly LevelStats[],
): Record<string, LevelStatsWire> {
  return Object.fromEntries(
    stats.map((s) => [
      String(s.levelNumber),
      {
        stars: s.stars,
        totalTime: s.totalTime,
        completedAt: new Date(s.completedAt).toISOString(),
      },
    ]),
  );
}

export function deriveLevelStats(
  trials: readonly TrialForLevelRun[],
): LevelStats[] {
  const best = new Map<number, LevelStats>();
  deriveLevelRuns(trials).forEach((run) => {
    const existing = best.get(run.levelNumber);
    const existingRecord = existing
      ? { stars: existing.stars, totalTime: existing.totalTime }
      : null;
    if (
      isBetterLevelRecord(
        { stars: run.stars, totalTime: run.totalTime },
        existingRecord,
      )
    ) {
      best.set(run.levelNumber, {
        levelNumber: run.levelNumber,
        stars: run.stars,
        totalTime: run.totalTime,
        completedAt: run.playedAt,
      });
    }
  });
  return Array.from(best.values());
}
