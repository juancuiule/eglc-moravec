import { isBetterLevelRecord } from "engine";
import { Api, type LevelStats } from "../api/Api";
import type { AuthState } from "../auth/store";
import { pushResults } from "../sync/pushResults";
import type { Finished } from "./index";

export type PersistFinishedLevelResult = {
  isNewRecord: boolean;
  record: LevelStats;
  refreshed: Promise<LevelStats>;
};

/**
 * Syncs a finished Level to the backend for any session at all — anonymous
 * or logged in. Every player gets an anonymous session automatically (see
 * AuthBoot/ensureSession), so LoggedOut here only means that first request
 * hasn't resolved yet or failed — nothing is persisted locally as a
 * fallback (there's no local trial history anymore; the backend is the
 * only store of record), so a run finished during that window is lost.
 *
 * Returns two things:
 * - `isNewRecord`/`record`: an immediate, local comparison against
 *   `previousRecord` — for this render's badge, and as the caller's
 *   ratchet value for a same-mount Replay. Never blocks.
 * - `refreshed`: resolves to the server-confirmed record once the push
 *   has actually landed and a fresh fetch confirms it — covers a record
 *   set on another device mid-session, which the local comparison alone
 *   can't see. Fire-and-forget, same as the push itself: callers should
 *   never await this before rendering, only use it to correct state
 *   later. When logged out (nothing was pushed), resolves to `record`
 *   unchanged rather than rejecting.
 */
export function persistFinishedLevel(
  state: Finished,
  authState: AuthState,
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

  const refreshed =
    authState.type !== "logged-out"
      ? pushResults(authState.token, config.levelNumber, results, state.runId)
          .then(() => Api.fetchLevelStats(authState.token))
          .then((levelStats) => levelStats[String(config.levelNumber)])
      : Promise.resolve(record);

  return { isNewRecord, record, refreshed };
}
