import { describe, expect, it } from "vitest";
import {
  computeContribution,
  computeErrorProfile,
  computeRhymeEffect,
  computeTieAdvantage,
  type InsightTrial,
} from "./researchInsights";

function trial(over: Partial<InsightTrial> = {}): InsightTrial {
  const operands = over.operands ?? [6, 7];
  return {
    categoryCodename: "1dx1d",
    operands,
    answer: operands.reduce((a, b) => a * b, 1),
    correct: true,
    timeExceeded: false,
    timeTaken: 2000,
    runType: "level",
    playedAt: 1_700_000_000_000,
    ...over,
  };
}

function times(n: number, over: Partial<InsightTrial>): InsightTrial[] {
  return Array.from({ length: n }, () => trial(over));
}

function wrong(operands: number[], answer: number | null, over = {}) {
  return trial({ operands, answer, correct: false, ...over });
}

describe("computeContribution", () => {
  it("counts every run type, with Focus inside practice", () => {
    expect(
      computeContribution([
        trial({ runType: "level" }),
        trial({ runType: "level" }),
        trial({ runType: "practice" }),
        trial({ runType: "practice_focus" }),
      ]),
    ).toEqual({ total: 4, level: 2, practice: 2 });
  });

  it("is all zeros for an empty history", () => {
    expect(computeContribution([])).toEqual({
      total: 0,
      level: 0,
      practice: 0,
    });
  });
});

describe("computeTieAdvantage", () => {
  const ties = (n: number, ms = 2000) =>
    times(n, { operands: [6, 6], timeTaken: ms });
  const nonTies = (n: number, ms = 2500) =>
    times(n, { operands: [5, 7], timeTaken: ms });

  it("claims a direction at exactly 10 ties and 20 non-ties", () => {
    const result = computeTieAdvantage([...ties(10), ...nonTies(20)]);
    expect(result.tie).toEqual({ count: 10, avgMs: 2000 });
    expect(result.nonTie).toEqual({ count: 20, avgMs: 2500 });
    expect(result.comparison).toEqual({
      kind: "ready",
      deltaMs: 500,
      direction: "faster",
    });
  });

  it("shows raw numbers and how many more are needed below the minimums", () => {
    const result = computeTieAdvantage([...ties(9), ...nonTies(15)]);
    expect(result.comparison).toEqual({ kind: "insufficient" });
    expect(result.tie).toEqual({ count: 9, avgMs: 2000 });
    expect(result.tiesNeeded).toBe(1);
    expect(result.nonTiesNeeded).toBe(5);
  });

  it("says no difference under 100 ms, and slower when ties lag", () => {
    expect(
      computeTieAdvantage([...ties(10, 2450), ...nonTies(20)]).comparison,
    ).toEqual({ kind: "ready", deltaMs: 50, direction: "none" });
    expect(
      computeTieAdvantage([...ties(10, 2700), ...nonTies(20)]).comparison,
    ).toEqual({ kind: "ready", deltaMs: -200, direction: "slower" });
  });

  it("compares only non-ties within one table step of a played tie", () => {
    const result = computeTieAdvantage([
      ...ties(10),
      ...nonTies(20),
      trial({ operands: [2, 3], timeTaken: 9000 }),
      trial({ operands: [8, 9], timeTaken: 9000 }),
      trial({ operands: [6, 7], timeTaken: 2500 }),
    ]);
    expect(result.nonTie.count).toBe(21);
  });

  it("leaves squaring rows out, since they have no non-tie control", () => {
    const result = computeTieAdvantage([
      ...times(12, { categoryCodename: "(2d)^2", operands: [12] }),
    ]);
    expect(result.tie.count).toBe(0);
    expect(result.tie.avgMs).toBeNull();
  });

  it("uses correct Level and Practice Trials only, not Focus", () => {
    const result = computeTieAdvantage([
      ...ties(10),
      ...nonTies(20),
      ...times(5, { operands: [6, 6], runType: "practice_focus" }),
      wrong([6, 6], 35),
      trial({ operands: [6, 6], runType: "practice" }),
    ]);
    expect(result.tie.count).toBe(11);
  });

  it("drops a trial more than 4 SD from its category mean", () => {
    const result = computeTieAdvantage([
      ...ties(10),
      ...nonTies(20),
      trial({ operands: [6, 6], timeTaken: 60_000 }),
    ]);
    expect(result.tie).toEqual({ count: 10, avgMs: 2000 });
  });

  it("counts timeouts in the outlier filter but never in the means", () => {
    const slowNonTie = trial({ operands: [5, 7], timeTaken: 20_000 });
    const timeouts = times(5, {
      operands: [4, 9],
      answer: null,
      correct: false,
      timeExceeded: true,
      timeTaken: 20_000,
    });

    const alone = computeTieAdvantage([
      ...ties(10),
      ...nonTies(20),
      slowNonTie,
    ]);
    expect(alone.nonTie.count).toBe(20);

    const withTimeouts = computeTieAdvantage([
      ...ties(10),
      ...nonTies(20),
      slowNonTie,
      ...timeouts,
    ]);
    expect(withTimeouts.nonTie.count).toBe(21);
  });

  it("is empty and insufficient with no trials", () => {
    expect(computeTieAdvantage([])).toEqual({
      tie: { count: 0, avgMs: null },
      nonTie: { count: 0, avgMs: null },
      tiesNeeded: 10,
      nonTiesNeeded: 20,
      comparison: { kind: "insufficient" },
    });
  });
});

describe("computeErrorProfile", () => {
  it("tags a table-neighbor answer and leaves a plain miss untagged", () => {
    const { entries } = computeErrorProfile([
      wrong([6, 7], 48),
      wrong([6, 7], 50, { playedAt: 1 }),
    ]);
    expect(entries).toEqual([
      {
        asked: "6 × 7",
        given: 48,
        count: 1,
        neighborLabel: "6 × 8",
        lastPlayedAt: 1_700_000_000_000,
      },
      {
        asked: "6 × 7",
        given: 50,
        count: 1,
        neighborLabel: null,
        lastPlayedAt: 1,
      },
    ]);
  });

  it("merges operand order, sorts by count then recency, and keeps 5", () => {
    const { entries } = computeErrorProfile([
      wrong([6, 7], 48, { playedAt: 10 }),
      wrong([7, 6], 48, { playedAt: 30 }),
      wrong([8, 7], 54, { playedAt: 5 }),
      wrong([3, 4], 13, { playedAt: 1 }),
      wrong([3, 5], 16, { playedAt: 2 }),
      wrong([3, 6], 19, { playedAt: 3 }),
      wrong([3, 7], 22, { playedAt: 4 }),
    ]);
    expect(entries.map((e) => [e.asked, e.given, e.count])).toEqual([
      ["6 × 7", 48, 2],
      ["7 × 8", 54, 1],
      ["3 × 7", 22, 1],
      ["3 × 6", 19, 1],
      ["3 × 5", 16, 1],
    ]);
    expect(entries[0].lastPlayedAt).toBe(30);
  });

  it("covers every multiplication category and every run type", () => {
    const { entries, wrongTotal } = computeErrorProfile([
      wrong([12, 3], 39, { categoryCodename: "2dx1d" }),
      wrong([6, 7], 48, { runType: "practice_focus" }),
    ]);
    expect(wrongTotal).toBe(2);
    expect(entries.find((e) => e.given === 39)?.neighborLabel).toBe("3 × 13");
  });

  it("ignores correct, unanswered, addition and squaring trials", () => {
    expect(
      computeErrorProfile([
        trial({ operands: [6, 7] }),
        wrong([6, 7], null),
        wrong([6, 7], 14, { categoryCodename: "1d+1d" }),
        wrong([12], 145, { categoryCodename: "(2d)^2" }),
      ]),
    ).toEqual({ entries: [], wrongTotal: 0, neighborShare: null });
  });

  it("reports the neighbor share only from 5 wrong answers on", () => {
    const four = [
      wrong([6, 7], 48),
      wrong([6, 7], 48),
      wrong([7, 8], 63),
      wrong([6, 7], 50),
    ];
    expect(computeErrorProfile(four).neighborShare).toBeNull();
    expect(
      computeErrorProfile([...four, wrong([4, 9], 32)]).neighborShare,
    ).toBeCloseTo(0.8);
  });
});

describe("computeRhymeEffect", () => {
  const order = (operands: number[], n: number, ms: number) =>
    times(n, { operands, timeTaken: ms });

  it("always lists the four rhyme pairs in rhyme order", () => {
    const { pairs, readyPairs, verdict } = computeRhymeEffect([]);
    expect(pairs.map((p) => p.pair)).toEqual([
      [6, 4],
      [7, 5],
      [9, 5],
      [6, 8],
    ]);
    expect(pairs[0]).toEqual({
      pair: [6, 4],
      rhyme: { count: 0, avgMs: null },
      control: { count: 0, avgMs: null },
      comparison: { kind: "insufficient" },
    });
    expect(readyPairs).toBe(0);
    expect(verdict).toEqual({ kind: "insufficient" });
  });

  it("compares a pair once each order has 3 correct trials", () => {
    const { pairs } = computeRhymeEffect([
      ...order([6, 4], 3, 2000),
      ...order([4, 6], 3, 2500),
      ...order([7, 5], 3, 2000),
      ...order([5, 7], 2, 2500),
    ]);
    expect(pairs[0].comparison).toEqual({
      kind: "ready",
      deltaMs: 500,
      direction: "faster",
    });
    expect(pairs[1].comparison).toEqual({ kind: "insufficient" });
    expect(pairs[1].control).toEqual({ count: 2, avgMs: 2500 });
  });

  it("gives a verdict from 2 ready pairs, counting pairs where rhyme is faster", () => {
    const result = computeRhymeEffect([
      ...order([6, 4], 3, 2000),
      ...order([4, 6], 3, 2500),
      ...order([7, 5], 3, 2000),
      ...order([5, 7], 3, 2050),
    ]);
    expect(result.readyPairs).toBe(2);
    expect(result.verdict).toEqual({ kind: "ready", shownOn: 1 });
  });

  it("uses correct, non-Focus trials and ignores other pairs", () => {
    const { pairs } = computeRhymeEffect([
      ...order([6, 4], 1, 2000),
      wrong([6, 4], 25),
      trial({ operands: [6, 4], runType: "practice_focus" }),
      trial({ operands: [3, 7] }),
    ]);
    expect(pairs[0].rhyme.count).toBe(1);
    expect(pairs.flatMap((p) => [p.rhyme.count, p.control.count])).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});
