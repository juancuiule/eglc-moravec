import { describe, expect, it } from "vitest";
import {
  activityCalendar,
  countsPerDay,
  daysTrainedThisMonth,
  localDayKey,
  weeklyCategoryTrend,
  type TrendTrial,
} from "./activityStats";

// Local-time helpers: build epochs from local date components so the tests
// pass regardless of the runner's timezone.
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

const played = (epochMs: number) => ({ playedAt: epochMs });
const trendTrial = (
  epochMs: number,
  overrides: Partial<TrendTrial> = {},
): TrendTrial => ({
  playedAt: epochMs,
  categoryCodename: "1dx1d",
  correct: true,
  timeTaken: 3000,
  ...overrides,
});

// Friday 2026-08-28; its Monday-start week begins 2026-08-24.
const NOW = new Date(2026, 7, 28, 15);

describe("localDayKey / countsPerDay", () => {
  it("formats local calendar days, not UTC", () => {
    expect(localDayKey(at(2026, 8, 28, 23, 59))).toBe("2026-08-28");
  });

  it("counts trials per local day", () => {
    const counts = countsPerDay([
      played(at(2026, 8, 28, 9)),
      played(at(2026, 8, 28, 22)),
      played(at(2026, 8, 27)),
    ]);
    expect(counts.get("2026-08-28")).toBe(2);
    expect(counts.get("2026-08-27")).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("daysTrainedThisMonth", () => {
  it("counts distinct days in the current month only", () => {
    const n = daysTrainedThisMonth(
      [
        played(at(2026, 8, 3)),
        played(at(2026, 8, 3, 22)),
        played(at(2026, 8, 28)),
        played(at(2026, 7, 30)), // July — excluded
      ],
      NOW,
    );
    expect(n).toBe(2);
  });
});

describe("activityCalendar", () => {
  it("returns Monday-start weeks ending at the current week, flagging future days", () => {
    const weeks = activityCalendar(
      [played(at(2026, 8, 28)), played(at(2026, 8, 28, 20))],
      12,
      NOW,
    );
    expect(weeks).toHaveLength(12);
    for (const week of weeks) expect(week).toHaveLength(7);

    const lastWeek = weeks[11];
    expect(lastWeek[0].day).toBe("2026-08-24"); // Monday
    expect(lastWeek[4].day).toBe("2026-08-28"); // today (Friday)
    expect(lastWeek[4].count).toBe(2);
    expect(lastWeek[4].future).toBe(false);
    expect(lastWeek[5].future).toBe(true); // Saturday hasn't happened
    expect(weeks[0][0].day).toBe("2026-06-08"); // 11 weeks earlier
  });
});

describe("weeklyCategoryTrend", () => {
  it("buckets by week, keeps order, and skips other categories", () => {
    const trend = weeklyCategoryTrend(
      [
        // week of Aug 17: two correct trials averaging 3s
        trendTrial(at(2026, 8, 18)),
        trendTrial(at(2026, 8, 19), { timeTaken: 5000 }),
        // week of Aug 24: one wrong trial → correctRate 0, avg null
        trendTrial(at(2026, 8, 26), { correct: false, timeTaken: 9000 }),
        // different category — ignored
        trendTrial(at(2026, 8, 18), { categoryCodename: "2dx1d" }),
      ],
      "1dx1d",
    );

    expect(trend).toHaveLength(2);
    expect(trend[0].weekStart).toBe("2026-08-17");
    expect(trend[0].correctRate).toBe(1);
    expect(trend[0].avgCorrectTimeMs).toBe(4000);
    expect(trend[1].weekStart).toBe("2026-08-24");
    expect(trend[1].correctRate).toBe(0);
    expect(trend[1].avgCorrectTimeMs).toBeNull();
  });

  it("keeps only the most recent maxWeeks", () => {
    const trials = Array.from({ length: 15 }, (_, w) =>
      trendTrial(at(2026, 8, 28 - w * 7)),
    );
    const trend = weeklyCategoryTrend(trials, "1dx1d", 10);
    expect(trend).toHaveLength(10);
    expect(trend[trend.length - 1].weekStart).toBe("2026-08-24");
  });
});
