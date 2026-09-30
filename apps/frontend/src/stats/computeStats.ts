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

// Buckets share one width and always start at 0. The width follows a 1/2/5
// progression picked to keep the row count bounded: 1s resolution for the
// common 0–20s band, coarser steps when a slow outlier (a (4d)^2 trial can
// reach ~80s) would otherwise emit one empty row per second (#80).
const MAX_BUCKETS = 20;
const BUCKET_WIDTHS_S = [1, 2, 5, 10, 20, 50, 100];

export function computeHistogram(
  trials: StatsTrial[],
  categoryCodename: string,
): HistogramBucket[] {
  const correct = trials.filter(
    (t) => t.categoryCodename === categoryCodename && t.correct,
  );
  if (correct.length === 0) return [];

  const maxSec = Math.max(...correct.map((t) => t.timeTaken)) / 1000;
  const width =
    BUCKET_WIDTHS_S.find((w) => Math.floor(maxSec / w) + 1 <= MAX_BUCKETS) ??
    BUCKET_WIDTHS_S[BUCKET_WIDTHS_S.length - 1];

  const buckets: HistogramBucket[] = Array.from(
    { length: Math.floor(maxSec / width) + 1 },
    (_, i) => ({
      label: `${i * width}–${(i + 1) * width}s`,
      count: 0,
    }),
  );

  for (const t of correct) {
    buckets[Math.floor(t.timeTaken / 1000 / width)].count++;
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
