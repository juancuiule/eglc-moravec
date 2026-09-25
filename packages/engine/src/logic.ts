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
import * as z from "zod";

export const MAX_SYNC_TRIALS = 1000;
export const MAX_DATE_TIMESTAMP = 8.64e15;

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

export function parseTrialResults(body: unknown): TrialResultInput[] | null {
  const parsed = TrialResultsSchema.safeParse(body);
  return parsed.success ? parsed.data.trials : null;
}

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
  const { correct, timeExceeded } = Trial.evaluate({
    operation,
    answer: input.answer,
    timeTaken: input.timeTaken,
    hintShown: input.hintShown,
  });

  return { ...input, correct, timeExceeded };
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
  const byRun = new Map<string, TrialForLevelRun[]>();
  trials.forEach((t) => {
    byRun.set(t.runId, [...(byRun.get(t.runId) ?? []), t]);
  });

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
