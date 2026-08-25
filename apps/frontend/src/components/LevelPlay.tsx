"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRxCollection, useRxDocument } from "rxdb/plugins/react";
import { useGame, gameStore } from "@/game/store";
import { watchStoreTransition } from "@/storeWatch";
import { persistFinishedLevel } from "@/game/persistFinishedLevel";
import { loadLevelStats, isLevelUnlocked } from "@/storage/levelStats";
import type { LevelDocType } from "@/levels/schema";
import type { Level } from "@/level";
import { TOTAL_TRIALS } from "@/game/index";
import { AnsweringView } from "./AnsweringView";
import { FinishedScreen } from "./FinishedScreen";

/** `level` is null when the live fetch failed — see the route's page.tsx. */
type Props = { levelNumber: number; level: Level | null };

type Availability =
  | { status: "ready"; level: Level }
  | { status: "resolving" }
  | { status: "unavailable" };

/**
 * `level` null means the backend couldn't be reached — not a 404, that's
 * already handled server-side. Falls back to the locally-replicated copy
 * (see src/levels and src/db) instead of leaving the page stuck;
 * "unavailable" only when that local copy doesn't have this Level either.
 */
function useAvailability(levelNumber: number, level: Level | null): Availability {
  const levelsCollection = useRxCollection<LevelDocType>("levels");
  const { result: localLevel, loading, error } = useRxDocument<LevelDocType>(
    levelsCollection,
    level === null ? String(levelNumber) : undefined,
  );

  useEffect(() => {
    if (level === null && localLevel) {
      console.warn(`Level ${levelNumber}: backend unreachable, using the locally-cached copy.`);
    }
  }, [levelNumber, level, localLevel?.levelNumber]);

  useEffect(() => {
    // A query error on the local replica is not the same as "not replicated
    // yet" — it still surfaces as the same "unavailable" state to the
    // player (there's no local data to show either way), but this keeps it
    // from being silently indistinguishable from that ordinary case.
    if (error) console.error(`Level ${levelNumber}: local database query failed:`, error);
  }, [levelNumber, error]);

  // Memoized so a "ready" object's identity only changes when the value it
  // actually carries does — otherwise it's a fresh literal every render,
  // which would re-run the load effect below on every unrelated re-render
  // (e.g. each trial's gameState update).
  return useMemo<Availability>(() => {
    if (level !== null) return { status: "ready", level };
    if (localLevel) return { status: "ready", level: localLevel.mix };
    // levelsCollection is null until useRxCollection's own effect has run —
    // treat that the same as "still loading", not "confirmed absent".
    if (levelsCollection === null || loading) return { status: "resolving" };
    return { status: "unavailable" };
  }, [level, localLevel, loading, levelsCollection]);
}

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
  const availability = useAvailability(levelNumber, level);

  // Persist + sync a Level the moment the game store reaches Finished —
  // tied to the state transition, not to whether FinishedScreen renders.
  useEffect(() => {
    return watchStoreTransition(
      gameStore,
      (s) => s.state.type === "finished",
      (s) => {
        if (s.state.type !== "finished") return;
        persistFinishedLevel(s.state);
      },
    );
  }, []);

  useEffect(() => {
    if (!isLevelUnlocked(levelNumber, loadLevelStats())) {
      router.replace("/");
    }
  }, [levelNumber, router]);

  useEffect(() => {
    if (availability.status !== "ready") return;
    // router.replace() above doesn't unmount this component synchronously,
    // so this effect needs its own guard against a locked level too —
    // otherwise a locked level's run can start (and even finish and persist)
    // before the redirect actually lands.
    if (!isLevelUnlocked(levelNumber, loadLevelStats())) return;

    const state = gameStore.getState().state;
    const alreadyThisLevel = state.type !== "loading" && state.config.levelNumber === levelNumber;
    if (alreadyThisLevel) return;

    // load() only starts from Loading or Finished — abandon a different
    // level's in-progress run first (e.g. navigating straight from one
    // level's URL to another's mid-play). An abandoned run was never
    // persisted anyway, only a Finished one is.
    if (state.type === "playing") gameStore.getState().reset();
    load({ levelNumber, level: availability.level, totalTrials: TOTAL_TRIALS });
  }, [levelNumber, availability, load]);

  if (gameState.type === "playing" && gameState.config.levelNumber === levelNumber) {
    return <AnsweringView state={gameState} />;
  }

  if (gameState.type === "finished" && gameState.config.levelNumber === levelNumber) {
    return <FinishedScreen state={gameState} />;
  }

  if (availability.status === "unavailable") {
    return (
      <p className="text-center text-sm text-danger py-8">
        This level isn't available offline yet — reconnect and try again.
      </p>
    );
  }

  return null; // briefly, while the effects above catch up
}
