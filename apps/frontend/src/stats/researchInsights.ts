// Personal versions of the effects packages/analysis reproduces from the
// whole dataset, computed on the device from the local Trial history.
import type { SyncedTrial } from "engine";
import type { StatsTrial } from "./computeStats";
import { multiplicationNeighbor } from "./operationStats";

export type InsightTrial = StatsTrial &
  Pick<SyncedTrial, "runType" | "playedAt">;

/** Display gates, not significance tests: below them a section shows raw
 *  numbers and never a direction word. minDirectionDeltaMs stands in for a
 *  confidence interval until one exists. */
export const INSIGHT_THRESHOLDS = {
  minTieTrials: 10,
  minNonTieTrials: 20,
  minWrongMultForShare: 5,
  minPerRhymeOrder: 3,
  minReadyRhymePairs: 2,
  minDirectionDeltaMs: 100,
  outlierSd: 4,
  topErrors: 5,
} as const;

/** Mirror of features.RHYME_ORDERED_PAIRS, each in its rhyming order. */
export const RHYME_ORDERED_PAIRS = [
  [6, 4],
  [7, 5],
  [9, 5],
  [6, 8],
] as const satisfies ReadonlyArray<readonly [number, number]>;

export type Direction = "faster" | "slower" | "none";

export type Arm = { count: number; avgMs: number | null };

/** deltaMs > 0 means the arm under test (ties, rhyme order) was faster. */
export type Comparison =
  | { kind: "insufficient" }
  | { kind: "ready"; deltaMs: number; direction: Direction };

export type Contribution = { total: number; level: number; practice: number };

export type TieAdvantage = {
  tie: Arm;
  nonTie: Arm;
  tiesNeeded: number;
  nonTiesNeeded: number;
  comparison: Comparison;
};

export type ErrorEntry = {
  asked: string;
  given: number;
  count: number;
  neighborLabel: string | null;
  lastPlayedAt: number;
};

export type ErrorProfile = {
  entries: ErrorEntry[];
  wrongTotal: number;
  neighborShare: number | null;
};

export type RhymePair = {
  pair: readonly [number, number];
  rhyme: Arm;
  control: Arm;
  comparison: Comparison;
};

export type RhymeEffect = {
  pairs: RhymePair[];
  readyPairs: number;
  verdict: { kind: "insufficient" } | { kind: "ready"; shownOn: number };
};

const T = INSIGHT_THRESHOLDS;

const isMultiplication = (t: StatsTrial) =>
  t.categoryCodename.includes("x") && t.operands.length === 2;

function arm(trials: readonly StatsTrial[]): Arm {
  return {
    count: trials.length,
    avgMs:
      trials.length > 0
        ? trials.reduce((sum, t) => sum + t.timeTaken, 0) / trials.length
        : null,
  };
}

function compare(tested: Arm, control: Arm, ready: boolean): Comparison {
  if (!ready || tested.avgMs === null || control.avgMs === null) {
    return { kind: "insufficient" };
  }
  const deltaMs = control.avgMs - tested.avgMs;
  const direction: Direction =
    Math.abs(deltaMs) < T.minDirectionDeltaMs
      ? "none"
      : deltaMs > 0
        ? "faster"
        : "slower";
  return { kind: "ready", deltaMs, direction };
}

/** Correct, in-time, non-Focus Trials that survive the paper's 4-SD RT
 *  filter (features.filter_rt_outliers), per category. Focus is out because
 *  its adaptive mix skews the category distribution. Timeouts join the
 *  filter's population as real slow tails but never the result, because
 *  their timeTaken is the solve-time cap. A category with fewer than 2 rows
 *  or zero spread keeps every row, where pandas would drop them on a NaN
 *  z-score. */
function measuredRtTrials(trials: readonly InsightTrial[]): InsightTrial[] {
  const byCategory = new Map<string, InsightTrial[]>();
  for (const t of trials) {
    if (t.runType === "practice_focus") continue;
    if (!t.correct && !t.timeExceeded) continue;
    const list = byCategory.get(t.categoryCodename) ?? [];
    list.push(t);
    byCategory.set(t.categoryCodename, list);
  }

  const kept: InsightTrial[] = [];
  for (const list of byCategory.values()) {
    const n = list.length;
    const mean = list.reduce((sum, t) => sum + t.timeTaken, 0) / n;
    const sd =
      n < 2
        ? 0
        : Math.sqrt(
            list.reduce((sum, t) => sum + (t.timeTaken - mean) ** 2, 0) /
              (n - 1),
          );
    for (const t of list) {
      const inRange =
        sd === 0 || Math.abs(t.timeTaken - mean) / sd <= T.outlierSd;
      if (inRange && t.correct && !t.timeExceeded) kept.push(t);
    }
  }
  return kept;
}

export function computeContribution(
  trials: readonly InsightTrial[],
): Contribution {
  const level = trials.filter((t) => t.runType === "level").length;
  return { total: trials.length, level, practice: trials.length - level };
}

/** Ties (6×6) against non-ties within one table step of a tie the player
 *  has answered: 6×6 = 36 pools with products from 5×6 = 30 to 6×7 = 42,
 *  in the same category. Squaring rows are ties too, but no category gives
 *  them a non-tie control, so they stay out. The non-tie arm is pooled, not
 *  paired per tie. */
export function computeTieAdvantage(
  trials: readonly InsightTrial[],
): TieAdvantage {
  const measured = measuredRtTrials(trials).filter(isMultiplication);
  const isTie = (t: StatsTrial) => t.operands[0] === t.operands[1];
  const ties = measured.filter(isTie);
  const bands = ties.map((t) => {
    const n = t.operands[0];
    return { codename: t.categoryCodename, min: (n - 1) * n, max: n * (n + 1) };
  });
  const nonTies = measured.filter((t) => {
    if (isTie(t)) return false;
    const product = t.operands[0] * t.operands[1];
    return bands.some(
      (b) =>
        b.codename === t.categoryCodename &&
        product >= b.min &&
        product <= b.max,
    );
  });

  const tie = arm(ties);
  const nonTie = arm(nonTies);
  const tiesNeeded = Math.max(0, T.minTieTrials - tie.count);
  const nonTiesNeeded = Math.max(0, T.minNonTieTrials - nonTie.count);
  return {
    tie,
    nonTie,
    tiesNeeded,
    nonTiesNeeded,
    comparison: compare(tie, nonTie, tiesNeeded === 0 && nonTiesNeeded === 0),
  };
}

/** Wrong multiplication answers across every run type: which product a
 *  player reaches for doesn't depend on how often Focus served a category. */
export function computeErrorProfile(
  trials: readonly InsightTrial[],
): ErrorProfile {
  const byMistake = new Map<string, ErrorEntry>();
  let wrongTotal = 0;
  let neighbors = 0;

  for (const t of trials) {
    if (t.correct || t.answer === null || !isMultiplication(t)) continue;
    const [a, b] = [...t.operands].sort((x, y) => x - y);
    const neighbor = multiplicationNeighbor(a, b, t.answer);
    wrongTotal += 1;
    if (neighbor) neighbors += 1;

    const key = `${t.categoryCodename}|${a}|${b}|${t.answer}`;
    const entry = byMistake.get(key);
    if (entry) {
      entry.count += 1;
      entry.lastPlayedAt = Math.max(entry.lastPlayedAt, t.playedAt);
    } else {
      byMistake.set(key, {
        asked: `${a} × ${b}`,
        given: t.answer,
        count: 1,
        neighborLabel: neighbor ? `${neighbor[0]} × ${neighbor[1]}` : null,
        lastPlayedAt: t.playedAt,
      });
    }
  }

  return {
    entries: [...byMistake.values()]
      .sort((x, y) => y.count - x.count || y.lastPlayedAt - x.lastPlayedAt)
      .slice(0, T.topErrors),
    wrongTotal,
    neighborShare:
      wrongTotal >= T.minWrongMultForShare ? neighbors / wrongTotal : null,
  };
}

/** Each pair in its rhyming order (6×4, "seis por cuatro, veinticuatro")
 *  against its reversal (4×6), as in features.add_rhyme_fields. */
export function computeRhymeEffect(
  trials: readonly InsightTrial[],
): RhymeEffect {
  const measured = measuredRtTrials(trials).filter(
    (t) => t.categoryCodename === "1dx1d",
  );
  const presented = (op1: number, op2: number) =>
    measured.filter((t) => t.operands[0] === op1 && t.operands[1] === op2);

  const pairs = RHYME_ORDERED_PAIRS.map((pair): RhymePair => {
    const rhyme = arm(presented(pair[0], pair[1]));
    const control = arm(presented(pair[1], pair[0]));
    const ready =
      rhyme.count >= T.minPerRhymeOrder && control.count >= T.minPerRhymeOrder;
    return { pair, rhyme, control, comparison: compare(rhyme, control, ready) };
  });

  const comparisons = pairs.map((p) => p.comparison);
  const readyPairs = comparisons.filter((c) => c.kind === "ready").length;
  return {
    pairs,
    readyPairs,
    verdict:
      readyPairs >= T.minReadyRhymePairs
        ? {
            kind: "ready",
            shownOn: comparisons.filter(
              (c) => c.kind === "ready" && c.direction === "faster",
            ).length,
          }
        : { kind: "insufficient" },
  };
}
