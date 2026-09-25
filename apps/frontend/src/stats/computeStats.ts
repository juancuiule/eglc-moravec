import {
  isSupportedCategoryCodename,
  SUPPORTED_CATEGORY_CODENAMES,
} from "engine";

// The minimal shape this module actually needs — deliberately not tied to
// Api.ts's SyncedTrial (which also carries a runType). StatsScreen filters
// by runType before calling in, so the same aggregation runs over either
// Level or Practice trials without an adapter — this module never cared
// about runType or levelNumber to begin with.
export type StatsTrial = {
  categoryCodename: string;
  operands: number[];
  answer: number | null;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
};

export type CategoryStats = {
  codename: string;
  total: number;
  correctCount: number;
  effectiveness: number; // 0–1
  avgTimeMs: number | null; // null if no correct trials
};

export type HistogramBucket = { label: string; count: number };

export function computeHistogram(
  trials: StatsTrial[],
  categoryCodename: string,
): HistogramBucket[] {
  const correct = trials.filter(
    (t) => t.categoryCodename === categoryCodename && t.correct,
  );
  if (correct.length === 0) return [];

  const maxBucket = Math.floor(
    Math.max(...correct.map((t) => t.timeTaken)) / 1000,
  );

  const buckets: HistogramBucket[] = Array.from(
    { length: maxBucket + 1 },
    (_, i) => ({
      label: `${i}–${i + 1}s`,
      count: 0,
    }),
  );

  for (const t of correct) {
    buckets[Math.floor(t.timeTaken / 1000)].count++;
  }

  return buckets;
}

export function computeStats(trials: StatsTrial[]): CategoryStats[] {
  const byCategory = new Map<string, StatsTrial[]>();

  for (const t of trials) {
    const list = byCategory.get(t.categoryCodename) ?? [];
    list.push(t);
    byCategory.set(t.categoryCodename, list);
  }

  // Currently supported categories first (canonical engine order), then any
  // retired/unknown codenames still present in the player's history — those
  // Trials remain valid research data even though they can't be replayed.
  const allCodenames = [
    ...SUPPORTED_CATEGORY_CODENAMES,
    ...[...byCategory.keys()].filter((k) => !isSupportedCategoryCodename(k)),
  ];

  return allCodenames.map((codename) => {
    const list = byCategory.get(codename) ?? [];
    const correct = list.filter((t) => t.correct);
    const avgTimeMs =
      correct.length > 0
        ? correct.reduce((sum, t) => sum + t.timeTaken, 0) / correct.length
        : null;

    return {
      codename,
      total: list.length,
      correctCount: correct.length,
      effectiveness: list.length > 0 ? correct.length / list.length : 0,
      avgTimeMs,
    };
  });
}
