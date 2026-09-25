// Time-based aggregations over playedAt. Same decoupling as computeStats.ts:
// minimal structural input types rather than Api's SyncedTrial, so the logic
// runs over any trial-ish rows.

export type PlayedTrial = { playedAt: number };
export type TrendTrial = PlayedTrial & {
  categoryCodename: string;
  correct: boolean;
  timeTaken: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local "YYYY-MM-DD" — day boundaries are the player's, never UTC's. */
export function localDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function countsPerDay(trials: PlayedTrial[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of trials) {
    const key = localDayKey(t.playedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Distinct calendar days with at least one trial, within `now`'s month. */
export function daysTrainedThisMonth(
  trials: PlayedTrial[],
  now = new Date(),
): number {
  const month = localDayKey(now.getTime()).slice(0, 7);
  const days = new Set(
    trials
      .map((t) => localDayKey(t.playedAt))
      .filter((k) => k.startsWith(month)),
  );
  return days.size;
}

/** Same counter over the server's pre-bucketed /sync/activity days —
 *  those "day" strings are already in the viewer's local timezone. */
export function daysInMonth(
  days: { day: string; trials: number }[],
  now = new Date(),
): number {
  const month = localDayKey(now.getTime()).slice(0, 7);
  return days.filter((d) => d.day.startsWith(month)).length;
}

function mondayOfWeek(epochMs: number): Date {
  const d = new Date(epochMs);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // (getDay()+6)%7 maps Sun..Sat to 6,0..5 — Monday-start weeks.
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function weekKey(epochMs: number): string {
  return localDayKey(mondayOfWeek(epochMs).getTime());
}

export type CalendarCell = { day: string; count: number; future: boolean };

/** GitHub-style calendar: `weeks` Monday-start columns of 7 cells, oldest
 *  first, last column = the current week (future days flagged blank). */
export function activityCalendar(
  trials: PlayedTrial[],
  weeks = 12,
  now = new Date(),
): CalendarCell[][] {
  const counts = countsPerDay(trials);
  const todayKey = localDayKey(now.getTime());
  const start = mondayOfWeek(now.getTime());
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const startMs = start.getTime();

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const day = startMs + (w * 7 + i) * 86_400_000;
      const key = localDayKey(day);
      return {
        day: key,
        count: counts.get(key) ?? 0,
        future: key > todayKey,
      };
    }),
  );
}

export type WeekTrend = {
  weekStart: string; // local YYYY-MM-DD of the week's Monday
  trials: number;
  correctRate: number;
  avgCorrectTimeMs: number | null; // null if the week had no correct trials
};

/** Per-week accuracy/speed trend for one category — weeks with no trials are
 *  omitted (a sparkline across gaps would imply continuity that isn't there). */
export function weeklyCategoryTrend(
  trials: TrendTrial[],
  codename: string,
  maxWeeks = 10,
): WeekTrend[] {
  const byWeek = new Map<string, TrendTrial[]>();
  for (const t of trials) {
    if (t.categoryCodename !== codename) continue;
    const key = weekKey(t.playedAt);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(t);
    else byWeek.set(key, [t]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-maxWeeks)
    .map(([weekStart, ts]) => {
      const correct = ts.filter((t) => t.correct);
      return {
        weekStart,
        trials: ts.length,
        correctRate: correct.length / ts.length,
        avgCorrectTimeMs:
          correct.length > 0
            ? correct.reduce((s, t) => s + t.timeTaken, 0) / correct.length
            : null,
      };
    });
}
