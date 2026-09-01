"use client";

import { type LevelStats } from "@/api/Api";
import { authStore } from "@/auth/store";

import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { gameStore, useGame } from "@/game/store";
import type { Level } from "@/level";
import { watchStoreTransition } from "@/storeWatch";
import { isBetterLevelRecord, TRIALS_PER_LEVEL } from "engine";
import { useEffect, useRef, useState } from "react";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";

type Props = {
  levelNumber: number;
  level: Level;
  stats: Record<string, LevelStats>;
};

export function LevelPlay({ levelNumber, level, stats }: Props) {
  const gameState = useGame((s) => s.state);
  const start = useGame((s) => s.start);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // In-memory only, per-mount — never persisted. Not a reintroduction of
  // the removed storage/levelStats.ts cache: it resets on every navigation
  // (see the effect below) and exists purely to stop a same-mount Replay
  // from comparing against a stale, page-load-frozen `stats` snapshot.
  const [previousRecord, setPreviousRecord] = useState<LevelStats | undefined>(
    () => stats[String(levelNumber)],
  );
  const previousRecordRef = useRef(previousRecord);
  previousRecordRef.current = previousRecord;

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = watchStoreTransition(
      gameStore,
      (s) => s.state.type === "finished",
      (s) => {
        if (s.state.type !== "finished") return;

        const { isNewRecord, record, refreshed } = persistFinishedLevel(
          s.state,
          authStore.getState().state,
          previousRecordRef.current,
        );
        setIsNewRecord(isNewRecord);
        setPreviousRecord(record);

        // Fire-and-forget: only ever corrects previousRecord later, once
        // the push has actually landed and a fresh fetch confirms it —
        // covers a record set on another device mid-session, which the
        // immediate local comparison above can't see. Never awaited
        // before rendering.
        refreshed
          .then((fresh) => {
            if (cancelled) return; // levelNumber changed, or unmounted
            setPreviousRecord((current) =>
              isBetterLevelRecord(fresh, current) ? fresh : current,
            );
          })
          .catch(() => {});
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [levelNumber]);

  useEffect(() => {
    const state = gameStore.getState().state;
    if (state.type !== "idle") gameStore.getState().reset();
    setPreviousRecord(stats[String(levelNumber)]);
    start({ levelNumber, level, totalTrials: TRIALS_PER_LEVEL });
  }, [levelNumber, level, stats, start]);

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
