import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_CATEGORY_CODENAMES } from "engine";
import type { CategoryStats } from "../stats/computeStats";
import {
  FOCUS_BADGE_MIN_TRIALS,
  FOCUS_WEIGHT_FLOOR,
  focusWeights,
  pickFocusCategory,
  weakestPracticedCategory,
} from "./focus";

function categoryStats(
  entries: ReadonlyArray<readonly [string, number, number]>,
): CategoryStats[] {
  return entries.map(([codename, total, correctCount]) => ({
    codename,
    total,
    correctCount,
    effectiveness: total > 0 ? correctCount / total : 0,
    avgTimeMs: null,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("focusWeights", () => {
  it("cold start — no history yields uniform weights over the catalog", () => {
    const weights = focusWeights(categoryStats([]));
    const values = SUPPORTED_CATEGORY_CODENAMES.map((c) => weights[c]);
    expect(new Set(values).size).toBe(1);
    // prior-only effectiveness 0.5 → weight = floor + 0.5
    expect(values[0]).toBeCloseTo(FOCUS_WEIGHT_FLOOR + 0.5);
  });

  it("weights skew toward the weakest category", () => {
    const weights = focusWeights(
      categoryStats([
        ["1d+1d", 20, 20], // mastered
        ["1dx1d", 20, 4], // weak
      ]),
    );
    expect(weights["1dx1d"]).toBeGreaterThan(weights["1d+1d"]);
  });

  it("smoothing keeps a one-Trial fluke from outranking a genuinely weak category", () => {
    const weights = focusWeights(
      categoryStats([
        ["1d+1d", 1, 0], // a single miss
        ["1dx1d", 30, 6], // sustained ~20% effectiveness
      ]),
    );
    expect(weights["1dx1d"]).toBeGreaterThan(weights["1d+1d"]);
  });

  it("a mastered category keeps a positive floor weight — skew, not a gate", () => {
    const weights = focusWeights(categoryStats([["1d+1d", 50, 50]]));
    expect(weights["1d+1d"]).toBeGreaterThan(0);
    // (50+2.5)/55 ≈ 0.95 smoothed → weight ≈ floor + 0.05
    expect(weights["1d+1d"]).toBeLessThan(FOCUS_WEIGHT_FLOOR + 0.1);
  });

  it("ignores retired codenames — they can never be drawn", () => {
    const weights = focusWeights(categoryStats([["oldcat", 10, 0]]));
    expect(weights["oldcat"]).toBeUndefined();
  });
});

describe("pickFocusCategory", () => {
  it("picks proportional to weight", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickFocusCategory({ "1d+1d": 3, "1dx1d": 1 })).toBe("1d+1d");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(pickFocusCategory({ "1d+1d": 3, "1dx1d": 1 })).toBe("1dx1d");
  });

  it("uniform-fallbacks on a degenerate weight map instead of throwing", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const picked = pickFocusCategory({});
    expect(SUPPORTED_CATEGORY_CODENAMES).toContain(
      picked as (typeof SUPPORTED_CATEGORY_CODENAMES)[number],
    );
    expect(pickFocusCategory({ "1d+1d": 0, "1dx1d": -2 })).toBe("1d+1d");
  });

  it("never draws a codename outside the supported catalog", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const picked = pickFocusCategory({ oldcat: 100, "1d+1d": 1 });
    expect(SUPPORTED_CATEGORY_CODENAMES).toContain(
      picked as (typeof SUPPORTED_CATEGORY_CODENAMES)[number],
    );
  });
});

describe("weakestPracticedCategory", () => {
  it("is null with no history at all", () => {
    expect(weakestPracticedCategory(categoryStats([]))).toBeNull();
  });

  it("is null when every category is under the minimum sample — a fluke doesn't badge", () => {
    expect(
      weakestPracticedCategory(
        categoryStats([["1d+1d", FOCUS_BADGE_MIN_TRIALS - 1, 0]]),
      ),
    ).toBeNull();
  });

  it("badges the lowest-effectiveness category once it has enough Trials", () => {
    expect(
      weakestPracticedCategory(
        categoryStats([
          ["1d+1d", 20, 20],
          ["1dx1d", 10, 3], // 0.3 — weakest
          ["2d+2d", 10, 9],
        ]),
      ),
    ).toBe("1dx1d");
  });

  it("a below-threshold category can't take the badge even at 0%", () => {
    expect(
      weakestPracticedCategory(
        categoryStats([
          ["1d+1d", 2, 0], // fluke — under the floor
          ["1dx1d", 10, 8],
        ]),
      ),
    ).toBe("1dx1d");
  });

  it("retired categories are never badged", () => {
    expect(
      weakestPracticedCategory(
        categoryStats([
          ["oldcat", 20, 0],
          ["1dx1d", 10, 8],
        ]),
      ),
    ).toBe("1dx1d");
  });
});
