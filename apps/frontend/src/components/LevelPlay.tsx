"use client";

import { type LevelStats } from "@/api/Api";
import { authStore } from "@/auth/store";

import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { gameStore, useGame } from "@/game/store";
import type { Level } from "@/level";
import { watchStoreTransition } from "@/storeWatch";
import { TRIALS_PER_LEVEL } from "engine";
import { useEffect, useState } from "react";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";

type Props = {
  levelNumber: number;
  level: Level;
  stats: Record<string, LevelStats>;
};

export function LevelPlay({ levelNumber, level, stats }: Props) {
  const gameState = useGame((s) => s.state);
  const load = useGame((s) => s.load);
  const [isNewRecord, setIsNewRecord] = useState(false);

  useEffect(() => {
    return watchStoreTransition(
      gameStore,
      (s) => s.state.type === "finished",
      (s) => {
        if (s.state.type !== "finished") return;
        const previousRecord = stats[String(s.state.config.levelNumber)];
        const isRecord = persistFinishedLevel(
          s.state,
          authStore.getState().state,
          previousRecord,
        );
        setIsNewRecord(isRecord);
      },
    );
  }, [stats]);

  useEffect(() => {
    const state = gameStore.getState().state;
    if (state.type !== "loading") gameStore.getState().reset();
    load({ levelNumber, level, totalTrials: TRIALS_PER_LEVEL });
  }, [levelNumber, level, load]);

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
        return <FinishedScreen state={gameState} isNewRecord={isNewRecord} />;
      }
      break;
    }
  }

  return null; // briefly, while the effect above catches up
}
