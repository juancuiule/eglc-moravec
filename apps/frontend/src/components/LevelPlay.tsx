"use client";

import { authStore } from "@/auth/store";
import { TOTAL_TRIALS } from "@/game/index";
import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { gameStore, useGame } from "@/game/store";
import type { Level } from "@/level";
import { isLevelUnlocked, loadLevelStats } from "@/storage/levelStats";
import { watchStoreTransition } from "@/storeWatch";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";

type Props = { levelNumber: number; level: Level };

/**
 * Hosts one Level's gameplay at /level/[levelNumber]. Whether the level
 * number itself is real is checked server-side (see the route's page.tsx,
 * which 404s otherwise) — whether *this player* has it unlocked can only be
 * checked here, client-side, against local LevelStats (see the
 * server-vs-client tradeoff this was scoped to when the routes were added).
 */
export function LevelPlay({ levelNumber, level }: Props) {
  const router = useRouter();
  const gameState = useGame((s) => s.state);
  const load = useGame((s) => s.load);

  // Persist + sync a Level the moment the game store reaches Finished —
  // tied to the state transition, not to whether FinishedScreen renders.
  useEffect(() => {
    return watchStoreTransition(
      gameStore,
      (s) => s.state.type === "finished",
      (s) => {
        if (s.state.type !== "finished") return;
        persistFinishedLevel(s.state, authStore.getState().state);
      },
    );
  }, []);

  useEffect(() => {
    if (!isLevelUnlocked(levelNumber, loadLevelStats())) {
      router.replace("/");
      return;
    }

    // Entering this route should always yield a fresh run, whether it's a
    // different level or a revisit of the same one — never resume a stale
    // Playing/Finished state left over from a previous visit. load() only
    // starts from Loading or Finished, so reset first if still Playing (e.g.
    // navigating straight from one level's URL to another's mid-play, or
    // back into the same level mid-play). An abandoned run was never
    // persisted anyway, only a Finished one is.
    const state = gameStore.getState().state;
    if (state.type !== "loading") gameStore.getState().reset();
    load({ levelNumber, level, totalTrials: TOTAL_TRIALS });
  }, [levelNumber, level, load, router]);

  const { type } = gameState;

  switch (type) {
    case "playing": {
      const { config } = gameState;
      if (config.levelNumber === levelNumber) {
        return <AnsweringView state={gameState} />;
      }
      break;
    }
    case "finished": {
      const { config } = gameState;
      if (config.levelNumber === levelNumber) {
        return <FinishedScreen state={gameState} />;
      }
      break;
    }
  }

  return null; // briefly, while the effect above catches up
}
