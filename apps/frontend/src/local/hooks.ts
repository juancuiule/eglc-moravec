"use client";

import { useTable, useValue } from "tinybase/ui-react";
import { useStore } from "zustand";
import type { LevelStats, SyncedTrial } from "../api/Api";
import { HYDRATED_VALUE, localStore, TRIALS_TABLE } from "./store";
import { levelStatsFromTrials, trialsFromTable } from "./trials";
import { syncStatus } from "./syncEngine";

// undefined while IndexedDB is still loading — callers render the same
// loading/empty states they already had, and importantly never treat an
// unhydrated store as "no data".
export function useLocalHydrated(): boolean {
  return useValue(HYDRATED_VALUE, localStore) === true;
}

// All locally-known trials (own pushes, pending outbox rows, pulled merges),
// sorted by playedAt. undefined until hydrated.
export function useLocalTrials(): SyncedTrial[] | undefined {
  const hydrated = useLocalHydrated();
  const table = useTable(TRIALS_TABLE, localStore);
  if (!hydrated) return undefined;
  return trialsFromTable(table);
}

// The /sync/level-stats read model, derived locally. undefined until
// hydrated — distinguishing "no records yet" from "still loading".
export function useLocalLevelStats(): Record<string, LevelStats> | undefined {
  const trials = useLocalTrials();
  if (trials === undefined) return undefined;
  return levelStatsFromTrials(trials);
}

// False until the sync engine's first flush attempt settles (success or
// failure). Gates that judge on local history — like LevelPlay's locked-
// redirect — hold while it's false, so a fresh device's boot pull gets a
// chance to merge server history before anything reads "no data".
export function useFirstPullSettled(): boolean {
  return useStore(syncStatus, (s) => s.firstPullSettled);
}
