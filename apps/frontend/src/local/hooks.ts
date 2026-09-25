"use client";

import { useTable, useValue } from "tinybase/ui-react";
import type { LevelStats, SyncedTrial } from "../api/Api";
import { HYDRATED_VALUE, localStore, TRIALS_TABLE } from "./store";
import { levelStatsFromTrials, trialsFromTable } from "./trials";

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
