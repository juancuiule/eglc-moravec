import {
  isSupportedCategoryCodename,
  math,
  SUPPORTED_CATEGORY_CODENAMES,
} from "engine";
import type { CategoryStats } from "../stats/computeStats";

/**
 * Adaptive "Focus" practice (#66) — a mixed-category Practice session whose
 * per-Trial category draw is weighted toward the player's weakest
 * categories, computed from the LOCAL trial read model. Everything runs
 * offline; nothing here touches the network.
 *
 * The skewed mix is why Focus trials sync with runType "practice_focus" —
 * the research pipeline can filter them out of distribution analyses (see
 * practiceRecordPolicy).
 */

// Route segment for Focus — deliberately not a category codename, so
// app/practice/[mode] branches on it before isSupportedCategoryCodename.
export const FOCUS_MODE = "focus";

// Per-category draw weights for one Focus session, keyed by codename.
export type FocusWeights = Record<string, number>;

// Laplace-style smoothing: every category carries PRIOR phantom Trials at
// PRIOR_EFFECTIVENESS, so cold start (no local history) collapses to a
// uniform draw and a 1–2-Trial category can't dominate on a fluke.
export const FOCUS_PRIOR_TRIALS = 5;
export const FOCUS_PRIOR_EFFECTIVENESS = 0.5;

// Added to every weight so a mastered category stays reachable — Focus is
// a skew, not a gate.
export const FOCUS_WEIGHT_FLOOR = 0.25;

// Below this many real Trials, a category's effectiveness is too noisy to
// pin the "recommended" badge on.
export const FOCUS_BADGE_MIN_TRIALS = 5;

/**
 * Draw weights over the supported catalog: lower smoothed effectiveness →
 * higher weight. With no history every category scores identically, which
 * makes the cold-start draw uniform — the same flat-catalog pick classic
 * Practice would give over the mix. Retired codenames in the stats are
 * ignored: they can never be drawn.
 */
export function focusWeights(stats: readonly CategoryStats[]): FocusWeights {
  const byCodename = new Map(stats.map((s) => [s.codename, s]));
  return Object.fromEntries(
    SUPPORTED_CATEGORY_CODENAMES.map((codename) => {
      const s = byCodename.get(codename);
      const smoothedEffectiveness =
        ((s?.correctCount ?? 0) +
          FOCUS_PRIOR_TRIALS * FOCUS_PRIOR_EFFECTIVENESS) /
        ((s?.total ?? 0) + FOCUS_PRIOR_TRIALS);
      return [codename, FOCUS_WEIGHT_FLOOR + (1 - smoothedEffectiveness)];
    }),
  );
}

/**
 * The single weakest category worth recommending on the selection screen:
 * lowest raw effectiveness among supported categories with at least
 * FOCUS_BADGE_MIN_TRIALS Trials. null when nothing qualifies — the badge
 * stays hidden rather than naming a fluke.
 */
export function weakestPracticedCategory(
  stats: readonly CategoryStats[],
): string | null {
  let weakest: string | null = null;
  let lowest = Infinity;
  for (const s of stats) {
    if (!isSupportedCategoryCodename(s.codename)) continue;
    if (s.total < FOCUS_BADGE_MIN_TRIALS) continue;
    if (s.effectiveness < lowest) {
      lowest = s.effectiveness;
      weakest = s.codename;
    }
  }
  return weakest;
}

/**
 * One weighted category draw for a Focus Trial. Only supported codenames
 * with a finite positive weight are eligible; a degenerate map (empty, all
 * zero/negative/non-finite) falls back to a uniform catalog pick instead of
 * letting math.pickRandomWeighted throw mid-session.
 */
export function pickFocusCategory(weights: FocusWeights): string {
  const entries = SUPPORTED_CATEGORY_CODENAMES.map(
    (codename) => [codename, weights[codename] ?? 0] as const,
  ).filter(([, weight]) => Number.isFinite(weight) && weight > 0);
  if (entries.length === 0) {
    return math.pickRandom([...SUPPORTED_CATEGORY_CODENAMES]);
  }
  return math.pickRandomWeighted(
    entries.map(([codename]) => codename),
    entries.map(([, weight]) => weight),
  );
}
