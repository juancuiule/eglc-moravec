import {
  TrialResultSchema,
  deriveLevelStats,
  isBetterLevelRecord,
  type TrialResult,
  type TrialResultInput,
} from "engine";
import type { Cell } from "tinybase";
import type { LevelStats, SyncedTrial } from "../api/Api";
import {
  afterHydration,
  isPersistenceLoading,
  localStore,
  TRIALS_TABLE,
  type LocalTrialCell,
} from "./store";

function parseOperands(raw: Cell | undefined): number[] {
  try {
    const parsed: unknown = JSON.parse(typeof raw === "string" ? raw : "");
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

// The shared flat-cell encoder — one shape for both write paths (enqueue
// writes synced:false + local display copies; merge writes synced:true +
// server-authoritative values). Optional cells are absent when null.
function trialCells(
  t: {
    categoryCodename: string;
    operands: number[];
    answer: number | null;
    timeTaken: number;
    playedAt: number;
    hintShown: boolean;
    runType: string;
    levelNumber: number | null;
    runId: string;
    correct: boolean;
    timeExceeded: boolean;
  },
  synced: boolean,
): LocalTrialCell {
  return {
    categoryCodename: t.categoryCodename,
    operands: JSON.stringify(t.operands),
    timeTaken: t.timeTaken,
    playedAt: t.playedAt,
    hintShown: t.hintShown,
    runType: t.runType,
    runId: t.runId,
    synced,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
    ...(t.answer !== null ? { answer: t.answer } : {}),
    ...(t.levelNumber !== null ? { levelNumber: t.levelNumber } : {}),
  };
}

// Decode a store row back into the wire/domain shape. Absent optional cells
// rehydrate to null — `answer` for timed-out trials, `levelNumber` for
// practice rows.
export function rowToSyncedTrial(
  rowId: string,
  row: {
    [cellId: string]: Cell;
  },
): SyncedTrial {
  return {
    id: rowId,
    runId: String(row.runId ?? ""),
    runType: row.runType === "practice" ? "practice" : "level",
    categoryCodename: String(row.categoryCodename ?? ""),
    levelNumber: typeof row.levelNumber === "number" ? row.levelNumber : null,
    operands: parseOperands(row.operands),
    answer: typeof row.answer === "number" ? row.answer : null,
    correct: row.correct === true,
    timeExceeded: row.timeExceeded === true,
    timeTaken: Number(row.timeTaken ?? 0),
    hintShown: row.hintShown === true,
    playedAt: Number(row.playedAt ?? 0),
  };
}

// Row → wire input, rebuilt per the runType discriminated union. Rows are
// re-validated here too: enqueue guards the write path, but a hand-edited or
// version-stale IndexedDB row shouldn't get to poison the whole batch.
function rowToInput(
  rowId: string,
  row: { [cellId: string]: Cell },
): TrialResultInput | null {
  const t = rowToSyncedTrial(rowId, row);
  const base = {
    id: t.id,
    runId: t.runId,
    categoryCodename: t.categoryCodename,
    timeTaken: t.timeTaken,
    playedAt: t.playedAt,
    operands: t.operands,
    answer: t.answer,
    hintShown: t.hintShown,
  };
  const input: TrialResultInput =
    t.runType === "level"
      ? { ...base, runType: "level", levelNumber: t.levelNumber ?? -1 }
      : { ...base, runType: "practice", levelNumber: null };
  const parsed = TrialResultSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("localFirst: skipping invalid queued trial", {
      id: rowId,
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

// Decode + sort shared by the imperative read (allLocalTrials) and the
// reactive hook (useLocalTrials in hooks.ts).
export function trialsFromTable(table: {
  [rowId: string]: { [cellId: string]: Cell };
}): SyncedTrial[] {
  return Object.entries(table)
    .map(([rowId, row]) => rowToSyncedTrial(rowId, row))
    .sort((a, b) => a.playedAt - b.playedAt);
}

export function allLocalTrials(): SyncedTrial[] {
  return trialsFromTable(localStore.getTable(TRIALS_TABLE));
}

export function pendingInputs(): TrialResultInput[] {
  const table = localStore.getTable(TRIALS_TABLE);
  return Object.entries(table)
    .filter(([, row]) => row.synced !== true)
    .map(([rowId, row]) => rowToInput(rowId, row))
    .filter((i): i is TrialResultInput => i !== null);
}

export function markSynced(ids: readonly string[]): void {
  ids.forEach((id) => localStore.setCell(TRIALS_TABLE, id, "synced", true));
}

// The single write path into the outbox. Runs at the finish/stop edge with
// inputs whose ids and playedAt were just minted from the true completion
// instant — retries later reuse these rows verbatim.
// Validation happens here, per row: a malformed input is dropped with a
// logged reason instead of poisoning the whole queue. Rows the backend has
// already acknowledged (same id present, synced) are left untouched — local
// display fields stay whatever the server last merged.
export function enqueueRun(
  inputs: readonly TrialResultInput[],
  results: readonly TrialResult[],
): void {
  // A persister mid-initial-load would clobber rows written now — replay the
  // enqueue once hydration lands. In-memory-only environments (tests, SSR)
  // take the immediate path.
  if (isPersistenceLoading()) {
    afterHydration(() => enqueueRun(inputs, results));
    return;
  }
  inputs.forEach((input, i) => {
    const parsed = TrialResultSchema.safeParse(input);
    if (!parsed.success) {
      console.warn("localFirst: dropping invalid trial input", {
        id: input.id,
        issues: parsed.error.issues,
      });
      return;
    }
    if (localStore.getCell(TRIALS_TABLE, input.id, "synced") === true) return;
    const result = results[i];
    localStore.setRow(
      TRIALS_TABLE,
      input.id,
      trialCells(
        {
          ...input,
          correct: result?.correct ?? false,
          timeExceeded: result?.timeExceeded ?? false,
        },
        false,
      ),
    );
  });
}

// Pull merge — the server is authoritative for evaluated fields, so its
// correct/timeExceeded overwrite the local display copies. A pulled row that
// matches a pending local row (same id) just became acknowledged: flip
// synced. Deletion reconciliation is deferred to phase 5's cursor sync.
export function mergeServerTrials(trials: readonly SyncedTrial[]): void {
  // Same clobber guard as enqueueRun — a merge mid-initial-load would be
  // overwritten by it.
  if (isPersistenceLoading()) {
    afterHydration(() => mergeServerTrials(trials));
    return;
  }
  trials.forEach((t) => {
    localStore.setRow(TRIALS_TABLE, t.id, trialCells(t, true));
  });
}

// What /sync/level-stats would return, derived from trial rows. Shared by the
// imperative read (persist's refreshed record) and the reactive hook.
export function levelStatsFromTrials(
  trials: readonly SyncedTrial[],
): Record<string, LevelStats> {
  const stats = deriveLevelStats(
    trials.map((t) => ({
      levelNumber: t.levelNumber,
      correct: t.correct,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      runId: t.runId,
      runType: t.runType,
    })),
  );
  return Object.fromEntries(
    stats.map((s) => [
      String(s.levelNumber),
      {
        stars: s.stars,
        totalTime: s.totalTime,
        completedAt: new Date(s.completedAt).toISOString(),
      },
    ]),
  );
}

// Imperative snapshot of the same read model, for non-React callers.
export function localLevelStats(): Record<string, LevelStats> {
  return levelStatsFromTrials(allLocalTrials());
}

// Best-of merge of a server-fetched stats snapshot with the local read
// model — per level, whichever record wins (more stars, then less time).
export function mergeLevelStats(
  server: Record<string, LevelStats>,
  local: Record<string, LevelStats>,
): Record<string, LevelStats> {
  const merged = { ...server };
  for (const [level, stats] of Object.entries(local)) {
    if (isBetterLevelRecord(stats, merged[level] ?? null)) {
      merged[level] = stats;
    }
  }
  return merged;
}
