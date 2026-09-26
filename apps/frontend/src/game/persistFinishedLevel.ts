import { isBetterLevelRecord, toTrialResultInputs } from "engine";
import type { LevelStats } from "../api/Api";
import { flushSettled } from "../local/syncEngine";
import { enqueueRun, localLevelStats } from "../local/trials";
import type { Finished } from "./index";

export type PersistFinishedLevelResult = {
  isNewRecord: boolean;
  record: LevelStats;
  refreshed: Promise<LevelStats>;
};

/**
 * Persists a finished Level into the local-first outbox — unconditionally,
 * for any session state and any network state. Trial inputs (ids + playedAt)
 * are minted here at the finish edge, where Date.now() is still the true
 * completion instant, then written to the durable store. The sync engine is
 * kicked to flush in the background; it owns session establishment and
 * retries. Nothing about rendering waits on the network.
 *
 * Returns two things:
 * - `isNewRecord`/`record`: an immediate, local comparison against
 *   `previousRecord` — for this render's badge, and as the caller's
 *   ratchet value for a same-mount Replay. Never blocks.
 * - `refreshed`: resolves to the locally-derived record once the next flush
 *   pass settles — by then the store holds this run plus anything the pull
 *   merged, so it covers a record set on another device mid-session, which
 *   the immediate comparison can't see. Fire-and-forget: callers should
 *   never await this before rendering, only use it to correct state later.
 *   If the flush can't push (offline), resolves to the local record anyway.
 */
export function persistFinishedLevel(
  state: Finished,
  previousRecord: LevelStats | undefined,
): PersistFinishedLevelResult {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  const isNewRecord = isBetterLevelRecord({ stars, totalTime }, previousRecord);
  const thisRun: LevelStats = {
    stars,
    totalTime,
    completedAt: new Date().toISOString(),
  };
  const record = isNewRecord ? thisRun : (previousRecord ?? thisRun);

  const inputs = toTrialResultInputs(
    results,
    {
      runType: "level",
      levelNumber: config.levelNumber,
      runId: state.runId,
    },
    Date.now(),
  );
  enqueueRun(inputs, results);

  const refreshed = flushSettled().then(
    () => localLevelStats()[String(config.levelNumber)] ?? record,
    () => record,
  );

  return { isNewRecord, record, refreshed };
}
