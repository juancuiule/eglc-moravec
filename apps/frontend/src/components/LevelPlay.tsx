"use client";

import { type LevelStats } from "@/api/Api";

import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { gameStore, useGame } from "@/game/store";
import type { Level } from "@/level";
import { useLocalHydrated, useLocalLevelStats } from "@/local/hooks";
import { mergeLevelStats } from "@/local/trials";
import { isLevelUnlocked } from "@/levels/isLevelUnlocked";
import { watchStoreTransition } from "@/storeWatch";
import { isBetterLevelRecord, TRIALS_PER_LEVEL } from "engine";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";
import { LoadingPanel } from "./LoadingPanel";

type Props = {
  levelNumber: number;
  level: Level;
  stats: Record<string, LevelStats>;
  nextLevelNumber: number | null;
};

export function LevelPlay({
  levelNumber,
  level,
  stats,
  nextLevelNumber,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Levels");
  const gameState = useGame((s) => s.state);
  const start = useGame((s) => s.start);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Unlock gating and the record comparison read from the local-first store,
  // merged best-of with the server-fetched snapshot. The store is only
  // trusted once hydrated — before that it may simply not have loaded yet.
  const hydrated = useLocalHydrated();
  const localStats = useLocalLevelStats() ?? {};
  const effectiveStats = mergeLevelStats(stats, localStats);
  const unlocked = isLevelUnlocked(levelNumber, effectiveStats);

  useEffect(() => {
    if (hydrated && !unlocked) router.replace("/");
  }, [hydrated, unlocked, router]);

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
            if (cancelled || !fresh) return; // levelNumber changed, unmounted, or no server record
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
    setPreviousRecord(effectiveStats[String(levelNumber)]);
    start({ levelNumber, level, totalTrials: TRIALS_PER_LEVEL });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `levelNumber`
    // changes reset the machine; `effectiveStats` is read fresh inside.
  }, [levelNumber, level, start]);

  // Once the local store hydrates, a locally-better record ratchets the
  // comparison baseline up (covers offline-completed or not-yet-pushed runs).
  useEffect(() => {
    if (!hydrated) return;
    const local = localStats[String(levelNumber)];
    if (local) {
      setPreviousRecord((current) =>
        isBetterLevelRecord(local, current ?? null) ? local : current,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check
    // when hydration lands or the level changes.
  }, [hydrated, levelNumber]);

  const { type } = gameState;

  // Don't judge locked/unlocked against an empty pre-hydration store.
  if (!hydrated) return <LoadingPanel label={t("loading")} />;
  if (!unlocked) return null; // redirecting away

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
        return (
          <FinishedScreen
            state={gameState}
            isNewRecord={isNewRecord}
            nextLevelNumber={nextLevelNumber}
          />
        );
      }
      break;
    }
  }

  return null; // briefly, while the effect above catches up
}
