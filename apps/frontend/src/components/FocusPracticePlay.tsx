"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFirstPullSettled, useLocalHydrated } from "../local/hooks";
import { allLocalTrials } from "../local/trials";
import { computeStats } from "../stats/computeStats";
import { focusWeights } from "../practice/focus";
import type { PracticeConfig } from "../practice";
import { LoadingPanel } from "./LoadingPanel";
import { PracticePlay } from "./PracticePlay";

/**
 * The /practice/focus entry (#66): a Practice session whose per-Trial
 * category is drawn from weights skewed toward the player's weakest
 * categories. Weights derive from the local read model — every locally
 * known Trial (Level, Practice, prior Focus) is per-category skill
 * evidence — and are frozen into the session config at mount, so a
 * mid-session store update can't silently re-weight an in-progress run.
 */
export function FocusPracticePlay() {
  const t = useTranslations("Practice");
  const hydrated = useLocalHydrated();
  // IndexedDB alone is not enough on a fresh device — hydration only
  // loads what this browser already has, while the account's history
  // arrives via the sync engine's first pull. Gating on its settle
  // (success OR failure, so offline play is preserved) lets that pull
  // merge before weights freeze; without it a known-weakness account on
  // a new device gets a uniform session.
  const firstPullSettled = useFirstPullSettled();
  if (!hydrated || !firstPullSettled)
    return <LoadingPanel label={t("loading")} />;
  return <FocusPlayInner />;
}

// Separate component so the weights initializer only ever runs
// post-hydration — hooks can't gate on it inside a single component.
function FocusPlayInner() {
  const [config] = useState<PracticeConfig>(() => ({
    mode: "focus",
    weights: focusWeights(computeStats(allLocalTrials())),
  }));
  return <PracticePlay config={config} />;
}
