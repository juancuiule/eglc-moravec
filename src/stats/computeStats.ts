import type { PersistedTrial } from "../storage/trialHistory";

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

export function computeStats(trials: PersistedTrial[]): CategoryStats[] {
  const byCategory = new Map<string, PersistedTrial[]>();

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
