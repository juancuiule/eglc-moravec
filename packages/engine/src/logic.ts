import {
  isBetterLevelRecord,
  LEVEL_COMPLETE_THRESHOLD,
  starsForScore,
} from "./levelScoring";
import { reconstructOperation } from "./operations/index";
import { Trial } from "./trial/engine";
import * as z from "zod";

export const TrialResultSchema = z.object({
  id: z.uuidv4(),
  runId: z.uuidv4(),
  levelNumber: z.number().nullable(),
  categoryCodename: z.string(),
  timeTaken: z.number(),
  playedAt: z.number(),
  operands: z.array(z.number()).max(2).min(1),
  answer: z.number().nullable(),
  hintShown: z.boolean(),
  runType: z.enum(["level", "practice"]),
});

export type TrialResultInput = z.infer<typeof TrialResultSchema>;

export function parseTrialResults(body: unknown): TrialResultInput[] | null {
  if (typeof body !== "object" || body === null) return null;
  const trials = (body as { trials?: unknown }).trials;

  if (!Array.isArray(trials)) return null;
  return trials.every((trial) => {
    const parsed = TrialResultSchema.safeParse(trial);
    return parsed.success;
  })
    ? trials
    : null;
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

  return {
    id: input.id,
    levelNumber: input.levelNumber,
    categoryCodename: input.categoryCodename,
    operands: input.operands,
    answer: input.answer,
    correct,
    timeExceeded,
    timeTaken: input.timeTaken,
    playedAt: input.playedAt,
    hintShown: input.hintShown,
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
  playedAt: number;
};

export type TrialForLevelRun = {
  levelNumber: number | null;
  correct: boolean;
  timeTaken: number;
  playedAt: number;
  runId: string;
};

export function deriveLevelRuns(
  trials: readonly TrialForLevelRun[],
): LevelRunSummary[] {
  const byRun = new Map<string, TrialForLevelRun[]>();
  trials.forEach((t) => {
    byRun.set(t.runId, [...(byRun.get(t.runId) ?? []), t]);
  });

  return Array.from(byRun.entries()).map(([levelRunId, runTrials]) => {
    const correctCount = runTrials.filter((t) => t.correct).length;
    const totalTime = runTrials.reduce((sum, t) => sum + t.timeTaken, 0);
    return {
      levelRunId,
      levelNumber: runTrials[0].levelNumber!,
      stars: starsForScore(correctCount),
      totalTime,
      levelCompleted: correctCount >= LEVEL_COMPLETE_THRESHOLD,
      playedAt: Math.max(...runTrials.map((t) => t.playedAt)),
    };
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
