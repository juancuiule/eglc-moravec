"use client";

import { useCell, useTable, useValue } from "tinybase/ui-react";
import { useStore } from "zustand";
import type { LevelStats, SyncedTrial } from "../api/Api";
import { useMemo, useRef } from "react";
import {
  EPOCH_VALUE,
  HYDRATED_VALUE,
  localEpoch,
  localStore,
  TRIALS_TABLE,
} from "./store";
import { authStore, authToken } from "../auth/store";
import { allLocalTrials, levelStatsFromTrials } from "./trials";
import {
  LEVEL_NUMBERS_VALUE,
  LEVELS_TABLE,
  parseLevelMix,
  parseLevelNumbers,
} from "./levels";
import { NO_SESSION, syncStatus } from "./syncEngine";

// undefined while IndexedDB is still loading — callers render the same
// loading/empty states they already had, and importantly never treat an
// unhydrated store as "no data".
export function useLocalHydrated(): boolean {
  return useValue(HYDRATED_VALUE, localStore) === true;
}

const EMPTY_STATS: Record<string, LevelStats> = {};

// The current local session generation — advances on every wipe. Per-mount
// state derived from a session's data (LevelPlay's record baseline) resets
// when this changes. EPOCH_VALUE is only the re-render trigger.
export function useLocalEpoch(): number {
  useValue(EPOCH_VALUE, localStore);
  return localEpoch();
}

// Server-fetched level stats are a first-paint seed fetched under whatever
// session held the page at render time — after a logout/account wipe they
// belong to a dead session and must not keep unlocking for the next user
// of this browser. The seed is valid only while the local epoch is the one
// it was captured under; a wipe drops it permanently for this mount (the
// next mount refetches under the new session anyway).
// EPOCH_VALUE is subscribed purely as the re-render trigger — the module
// epoch is what's compared (a persisted mirror can't forge identity).
export function useSessionSeedStats(
  seed: Record<string, LevelStats>,
): Record<string, LevelStats> {
  useValue(EPOCH_VALUE, localStore);
  const captured = useRef(localEpoch());
  return localEpoch() === captured.current ? seed : EMPTY_STATS;
}

// All locally-known trials (own pushes, pending outbox rows, pulled merges),
// sorted by playedAt. undefined until hydrated.
export function useLocalTrials(): SyncedTrial[] | undefined {
  const hydrated = useLocalHydrated();
  // The subscription is the re-render trigger; the rows come from the
  // shared decoded cache, so a store write doesn't re-parse the whole
  // table for every mounted consumer.
  useTable(TRIALS_TABLE, localStore);
  if (!hydrated) return undefined;
  return allLocalTrials();
}

// The /sync/level-stats read model, derived locally. undefined until
// hydrated — distinguishing "no records yet" from "still loading".
// `excludeRunId` leaves one run out of the derive — a run still on screen,
// whose rows reach the store before its own record has been judged.
export function useLocalLevelStats(
  excludeRunId?: string,
): Record<string, LevelStats> | undefined {
  const trials = useLocalTrials();
  // trials' identity is stable between writes now (the decoded cache), so
  // this derive only re-runs when the history actually changed.
  return useMemo(
    () =>
      trials === undefined
        ? undefined
        : levelStatsFromTrials(
            excludeRunId === undefined
              ? trials
              : trials.filter((t) => t.runId !== excludeRunId),
          ),
    [trials, excludeRunId],
  );
}

// The catalog number list from the local snapshot. undefined until
// hydrated, null once hydrated-but-never-warmed — the difference between
// "loading" and "nothing cached" for offline fallbacks.
export function useLocalLevelNumbers(): number[] | null | undefined {
  const hydrated = useLocalHydrated();
  const raw = useValue(LEVEL_NUMBERS_VALUE, localStore);
  // Memoize on the raw string — parseLevelNumbers allocates a fresh array
  // per call, which would make the result unstable across renders.
  return useMemo(
    () => (hydrated ? parseLevelNumbers(raw) : undefined),
    [hydrated, raw],
  );
}

// The cached mix for one level — undefined until hydrated, null when the
// snapshot doesn't have it (or it failed validation).
export function useLocalLevelMix(
  levelNumber: number,
): Record<string, number> | null | undefined {
  const hydrated = useLocalHydrated();
  const raw = useCell(LEVELS_TABLE, String(levelNumber), "mix", localStore);
  return useMemo(
    () => (hydrated ? parseLevelMix(raw) : undefined),
    [hydrated, raw],
  );
}

// Unacknowledged outbox rows — undefined until hydrated (so "0" can't flash
// while IndexedDB is still loading). O(rows) per table write; trial writes
// are per-answer, so that's cheap enough for a status chip.
export function usePendingOutboxCount(): number | undefined {
  const hydrated = useLocalHydrated();
  const table = useTable(TRIALS_TABLE, localStore);
  return useMemo(
    () =>
      hydrated
        ? Object.values(table).filter((row) => row.synced !== true).length
        : undefined,
    [hydrated, table],
  );
}

// False until the sync engine's first flush attempt settles (success or
// failure). Gates that judge on local history — like LevelPlay's locked-
// redirect — hold while it's false, so a fresh device's boot pull gets a
// chance to merge server history before anything reads "no data".
export function useFirstPullSettled(): boolean {
  // Scoped to the CURRENT token — a settle from a previous session
  // (anonymous boot pull before a login, say) must not satisfy the gate:
  // the new session's own pull is still outstanding. While NO session
  // exists the gate waits on the engine's own verdict — NO_SESSION means
  // "session mint failed; nothing to pull", settled under the empty token.
  const settledFor = useStore(syncStatus, (s) => s.pullSettledToken);
  const token = useStore(authStore, (s) => authToken(s.state));
  return settledFor === (token ?? NO_SESSION);
}
