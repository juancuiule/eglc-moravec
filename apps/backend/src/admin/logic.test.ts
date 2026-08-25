import { describe, it, expect } from "vitest";
import { summarizeLevelPerformance, summarizeCategoryPerformance } from "./logic.js";

describe("summarizeLevelPerformance", () => {
  it("computes effectiveness as correct over total attempts", () => {
    const [summary] = summarizeLevelPerformance([
      { level_number: 3, attempt_count: 10, user_count: 4, correct_count: 7, avg_time_taken: 1200 },
    ]);
    expect(summary).toEqual({
      levelNumber: 3,
      attemptCount: 10,
      userCount: 4,
      effectiveness: 0.7,
      avgTimeMs: 1200,
    });
  });

  it("effectiveness is 0 when there are no attempts", () => {
    const [summary] = summarizeLevelPerformance([
      { level_number: 5, attempt_count: 0, user_count: 0, correct_count: 0, avg_time_taken: null },
    ]);
    expect(summary.effectiveness).toBe(0);
  });

  it("passes through a null avgTimeMs when there are no correct attempts", () => {
    const [summary] = summarizeLevelPerformance([
      { level_number: 1, attempt_count: 5, user_count: 2, correct_count: 0, avg_time_taken: null },
    ]);
    expect(summary.avgTimeMs).toBeNull();
  });

  it("maps multiple rows independently, preserving order", () => {
    const summaries = summarizeLevelPerformance([
      { level_number: 1, attempt_count: 10, user_count: 1, correct_count: 10, avg_time_taken: 1000 },
      { level_number: 2, attempt_count: 10, user_count: 1, correct_count: 5, avg_time_taken: 2000 },
    ]);
    expect(summaries.map((s) => s.levelNumber)).toEqual([1, 2]);
    expect(summaries[0].effectiveness).toBe(1);
    expect(summaries[1].effectiveness).toBe(0.5);
  });
});

describe("summarizeCategoryPerformance", () => {
  it("computes effectiveness for a category row", () => {
    const [summary] = summarizeCategoryPerformance([
      {
        category_codename: "2dx1d",
        attempt_count: 8,
        user_count: 3,
        correct_count: 6,
        avg_time_taken: 4500,
      },
    ]);
    expect(summary).toEqual({
      categoryCodename: "2dx1d",
      attemptCount: 8,
      userCount: 3,
      effectiveness: 0.75,
      avgTimeMs: 4500,
    });
  });
});
