"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame, gameStore } from "@/game/store";
import { authStore } from "@/auth/store";
import { watchStoreTransition } from "@/storeWatch";
import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { loadLevelStats, isLevelUnlocked } from "@/storage/levelStats";
import { LEVELS } from "@/LEVELS";
import { TOTAL_TRIALS } from "@/game/index";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";

type Props = { levelNumber: number };

/**
 * Hosts one Level's gameplay at /level/[levelNumber]. Whether the level
 * number itself is real is checked server-side (see the route's page.tsx,
 * which 404s otherwise) — whether *this player* has it unlocked can only be
 * checked here, client-side, against local LevelStats (see the
 * server-vs-client tradeoff this was scoped to when the routes were added).
 */
export function LevelPlay({ levelNumber }: Props) {
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

    const state = gameStore.getState().state;
    const alreadyThisLevel = state.type !== "loading" && state.config.levelNumber === levelNumber;
    if (alreadyThisLevel) return;

    // load() only starts from Loading or Finished — abandon a different
    // level's in-progress run first (e.g. navigating straight from one
    // level's URL to another's mid-play). An abandoned run was never
    // persisted anyway, only a Finished one is.
    if (state.type === "playing") gameStore.getState().reset();
    load({ levelNumber, level: LEVELS[String(levelNumber)], totalTrials: TOTAL_TRIALS });
  }, [levelNumber, load, router]);

  if (gameState.type === "playing" && gameState.config.levelNumber === levelNumber) {
    return <AnsweringView state={gameState} />;
  }

  if (gameState.type === "finished" && gameState.config.levelNumber === levelNumber) {
    return <FinishedScreen state={gameState} />;
  }

  return null; // briefly, while the effect above catches up
}
