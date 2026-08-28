import { isBetterLevelRecord } from "engine";
import type { LevelStats } from "../api/Api";
import type { AuthState } from "../auth/store";
import { pushResults } from "../sync/pushResults";
import type { Finished } from "./index";

/**
 * Syncs a finished Level to the backend for any session at all — anonymous
 * or logged in. Every player gets an anonymous session automatically (see
 * AuthBoot/ensureSession), so LoggedOut here only means that first request
 * hasn't resolved yet or failed — nothing is persisted locally as a
 * fallback (there's no local trial history anymore; the backend is the
 * only store of record), so a run finished during that window is lost.
 *
 * Returns whether this run beat `previousRecord` — FinishedScreen uses this
 * to decide whether to celebrate. There's no local LevelStats cache to read
 * or update anymore (see storage/levelStats.ts's removal — stats are
 * server-derived, fetched fresh, never persisted client-side), so the
 * caller passes in whatever record it already fetched for this level.
 */
export function persistFinishedLevel(
  state: Finished,
  authState: AuthState,
  previousRecord: LevelStats | undefined,
): boolean {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  const isNewRecord = isBetterLevelRecord({ stars, totalTime }, previousRecord);

  if (authState.type !== "logged-out") {
    pushResults(authState.token, config, results, state.runId);
  }

  return isNewRecord;
}
