import { describe, it, expect } from "vitest";
import { SUPPORTED_CATEGORY_CODENAMES } from "engine";
import {
  computeHistogram,
  computeStats,
  type StatsTrial,
} from "./computeStats";

function trial(
  categoryCodename: string,
  correct: boolean,
  timeExceeded = false,
  timeTaken = 3000,
  operands: number[] = [1, 1],
  answer: number | null = 1,
): StatsTrial {
  return {
    categoryCodename,
    operands,
    answer,
    correct,
    timeExceeded,
    timeTaken,
  };
}

describe("computeStats", () => {
  it("returns a row for every known category", () => {
    const stats = computeStats([]);
    expect(stats.map((s) => s.codename)).toEqual(SUPPORTED_CATEGORY_CODENAMES);
  });

  it("rows with no attempts have total=0 and effectiveness=0", () => {
    const stats = computeStats([]);
    for (const row of stats) {
      expect(row.total).toBe(0);
      expect(row.effectiveness).toBe(0);
      expect(row.avgTimeMs).toBeNull();
    }
  });

  it("counts correct trials — including correct-but-late — as successes", () => {
    const trials = [
      trial("1d+1d", true, false, 2000),
      trial("1d+1d", true, false, 4000),
      trial("1d+1d", false, false),
      trial("1d+1d", true, true, 8000), // correct but late — still counts
    ];
    const stats = computeStats(trials);
    const row = stats.find((s) => s.codename === "1d+1d")!;
    expect(row.total).toBe(4);
    expect(row.correctCount).toBe(3);
    expect(row.effectiveness).toBeCloseTo(0.75);
    expect(row.avgTimeMs).toBeCloseTo((2000 + 4000 + 8000) / 3);
  });

  it("avgTimeMs is null when there are no correct trials", () => {
    const trials = [trial("1dx1d", false), trial("1dx1d", false, true)];
    const stats = computeStats(trials);
    const row = stats.find((s) => s.codename === "1dx1d")!;
    expect(row.avgTimeMs).toBeNull();
  });

  it("includes unknown categories from history at the end", () => {
    const trials = [trial("9dx9d", true)];
    const stats = computeStats(trials);
    const last = stats[stats.length - 1];
    expect(last.codename).toBe("9dx9d");
  });
});

describe("computeHistogram", () => {
  it("returns no buckets when the category has no correct trials", () => {
    const buckets = computeHistogram(
      [trial("1dx1d", false), trial("1d+1d", true)],
      "1dx1d",
    );
    expect(buckets).toEqual([]);
  });

  it("keeps 1s buckets for the common sub-20s spread", () => {
    const buckets = computeHistogram(
      [
        trial("1dx1d", true, false, 3_400),
        trial("1dx1d", true, false, 8_100),
        trial("1dx1d", true, false, 11_900),
      ],
      "1dx1d",
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[0].label).toBe("0–1s");
    expect(buckets.map((b) => b.count)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1,
    ]);
  });

  // Regression test for #80: a single ~80s trial used to emit one bucket
  // per second — ~74 empty rows. The width widens along a 1/2/5 step
  // progression so the row count stays bounded instead.
  it("widens the bucket width instead of emitting a wall of empty rows", () => {
    const buckets = computeHistogram(
      [trial("(4d)^2", true, false, 79_500)],
      "(4d)^2",
    );
    expect(buckets.length).toBeLessThanOrEqual(20);
    const last = buckets[buckets.length - 1];
    expect(last.label).toBe("75–80s");
    expect(last.count).toBe(1);
  });

  it("keeps the dense band coherent when an outlier widens the step", () => {
    const buckets = computeHistogram(
      [
        trial("(4d)^2", true, false, 3_000),
        trial("(4d)^2", true, false, 4_500),
        trial("(4d)^2", true, false, 7_200),
        trial("(4d)^2", true, false, 79_500),
      ],
      "(4d)^2",
    );
    // 5s buckets: 0–5s takes the 3s + 4.5s trials, 5–10s the 7.2s one,
    // 75–80s the outlier.
    expect(buckets).toHaveLength(16);
    expect(buckets[0]).toEqual({ label: "0–5s", count: 2 });
    expect(buckets[1]).toEqual({ label: "5–10s", count: 1 });
    expect(buckets[15]).toEqual({ label: "75–80s", count: 1 });
  });
});
