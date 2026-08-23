// The minimal shape this module actually needs — deliberately not tied to
// Level's PersistedTrial (which also carries levelNumber). Both PersistedTrial
// and Practice's PersistedPracticeTrial satisfy this structurally, so the
// same aggregation runs over either trial history without a levelNumber or
// an adapter — this module never cared about levelNumber to begin with.
export type StatsTrial = {
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
};

export type CategoryStats = {
  codename: string;
  total: number;
  correctInTime: number;
  effectiveness: number; // 0–1
  avgTimeMs: number | null; // null if no correct-in-time trials
};

// Ordered list of all known categories, from simplest to hardest
export const ALL_CATEGORIES: string[] = [
  "1d+1d",
  "2d+2d",
  "1dx1d",
  "2dx1d",
  "3dx1d",
  "4dx1d",
  "(2d)^2",
  "(3d)^2",
  "(4d)^2",
];

export type HistogramBucket = { label: string; count: number };

export function computeHistogram(
  trials: StatsTrial[],
  categoryCodename: string,
): HistogramBucket[] {
  const correct = trials.filter(
    (t) => t.categoryCodename === categoryCodename && t.correct && !t.timeExceeded,
  );
  if (correct.length === 0) return [];

  const maxBucket = Math.floor(Math.max(...correct.map((t) => t.timeTaken)) / 1000);

  const buckets: HistogramBucket[] = Array.from({ length: maxBucket + 1 }, (_, i) => ({
    label: `${i}–${i + 1}s`,
    count: 0,
  }));

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

  // Include all known categories + any unknown ones from history
  const allCodenames = [
    ...ALL_CATEGORIES,
    ...[...byCategory.keys()].filter((k) => !ALL_CATEGORIES.includes(k)),
  ];

  return allCodenames.map((codename) => {
    const list = byCategory.get(codename) ?? [];
    const correctInTime = list.filter((t) => t.correct && !t.timeExceeded);
    const avgTimeMs =
      correctInTime.length > 0
        ? correctInTime.reduce((sum, t) => sum + t.timeTaken, 0) /
          correctInTime.length
        : null;

    return {
      codename,
      total: list.length,
      correctInTime: correctInTime.length,
      effectiveness: list.length > 0 ? correctInTime.length / list.length : 0,
      avgTimeMs,
    };
  });
}
