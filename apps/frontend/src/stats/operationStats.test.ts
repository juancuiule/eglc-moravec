import { describe, expect, it } from "vitest";
import {
  computeOperationStats,
  findConfusions,
  multiplicationNeighbor,
} from "./operationStats";
import type { StatsTrial } from "./computeStats";

function trial(
  categoryCodename: string,
  operands: number[],
  correct: boolean,
  answer: number | null = null,
  timeTaken = 3000,
): StatsTrial {
  return {
    categoryCodename,
    operands,
    answer,
    correct,
    timeExceeded: false,
    timeTaken,
  };
}

describe("computeOperationStats", () => {
  it("groups {6,7} and {7,6} as the same operation", () => {
    const stats = computeOperationStats(
      [
        trial("1dx1d", [6, 7], true, 42, 2000),
        trial("1dx1d", [7, 6], false, 48, 4000),
      ],
      "1dx1d",
    );
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      label: "6 × 7",
      operands: [6, 7],
      attempts: 2,
      errors: 1,
      avgCorrectTimeMs: 2000,
    });
  });

  it("ignores trials from other categories", () => {
    const stats = computeOperationStats(
      [trial("1dx1d", [6, 7], true), trial("2dx1d", [12, 5], false)],
      "1dx1d",
    );
    expect(stats).toHaveLength(1);
    expect(stats[0].label).toBe("6 × 7");
  });

  it("sorts by error count, then attempt count", () => {
    const stats = computeOperationStats(
      [
        trial("1dx1d", [2, 3], false),
        trial("1dx1d", [2, 3], false),
        trial("1dx1d", [4, 5], true),
        trial("1dx1d", [4, 5], false),
        trial("1dx1d", [4, 5], false),
        trial("1dx1d", [4, 5], true),
      ],
      "1dx1d",
    );
    // Both miss twice; the one attempted more often ranks first.
    expect(stats.map((s) => s.label)).toEqual(["4 × 5", "2 × 3"]);
  });

  it("renders labels per category family", () => {
    expect(
      computeOperationStats([trial("2d+2d", [47, 35], true)], "2d+2d")[0].label,
    ).toBe("35 + 47");
    expect(
      computeOperationStats([trial("(2d)^2", [12], true)], "(2d)^2")[0].label,
    ).toBe("12²");
  });

  it("avgCorrectTimeMs is null when the operation was never answered correctly", () => {
    const stats = computeOperationStats(
      [trial("1dx1d", [6, 7], false)],
      "1dx1d",
    );
    expect(stats[0].avgCorrectTimeMs).toBeNull();
  });
});

describe("multiplicationNeighbor (port of analysis classify_multiplication_error)", () => {
  it.each<[number, number, number, [number, number] | null]>([
    [6, 7, 48, [6, 8]], // the paper's headline example: 48 for 6×7 is 6×8
    [6, 7, 35, [5, 7]],
    [6, 7, 42, null], // the correct answer is not a neighbor
    [6, 7, 40, null], // numeric near-miss but not a table product
    [7, 6, 48, [8, 6]],
    [12, 5, 55, [11, 5]], // generalizes past single-digit tables
    [12, 5, 48, [12, 4]],
  ])("%d×%d answered %d → %j", (a, b, answer, expected) => {
    expect(multiplicationNeighbor(a, b, answer)).toEqual(expected);
  });
});

describe("findConfusions", () => {
  it("aggregates repeated table-neighbor errors with their neighbor", () => {
    const confusions = findConfusions(
      [
        trial("1dx1d", [6, 7], false, 48),
        trial("1dx1d", [7, 6], false, 48),
        trial("1dx1d", [6, 7], false, 40),
        trial("1dx1d", [6, 7], true, 42),
      ],
      "1dx1d",
    );
    expect(confusions).toHaveLength(2);
    expect(confusions[0]).toEqual({
      asked: "6 × 7",
      given: 48,
      count: 2,
      neighborLabel: "6 × 8",
    });
    expect(confusions[1]).toEqual({
      asked: "6 × 7",
      given: 40,
      count: 1,
      neighborLabel: null,
    });
  });

  it("skips timed-out trials (answer null) and returns [] for non-multiplication categories", () => {
    expect(
      findConfusions([trial("1dx1d", [6, 7], false, null)], "1dx1d"),
    ).toEqual([]);
    expect(
      findConfusions([trial("2d+2d", [47, 35], false, 77)], "2d+2d"),
    ).toEqual([]);
  });
});
