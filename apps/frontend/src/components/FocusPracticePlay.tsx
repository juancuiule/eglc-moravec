"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocalHydrated } from "../local/hooks";
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
  // Until IndexedDB lands the read model looks empty and would freeze a
  // misleading uniform weight map into the session — wait it out.
  if (!hydrated) return <LoadingPanel label={t("loading")} />;
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
