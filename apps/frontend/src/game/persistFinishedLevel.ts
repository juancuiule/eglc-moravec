import type { Finished } from "./index";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { queueTrialResults } from "../sync/trialResults/queue";
import { writeOptimisticLevelStats } from "../sync/levelStats/optimisticWrite";

/**
 * Persists a finished Level locally, and queues it for sync to the backend —
 * for any session at all, anonymous or logged in. Every player gets an
 * anonymous session automatically (see AuthBoot/ensureSession); the queued
 * local write doesn't need a token itself (that's only needed once the
 * background push replication actually talks to the backend — see
 * sync/trialResults/replication.ts, which reads the current session fresh
 * when it runs), so this no longer needs the caller's auth state at all.
 *
 * updateLevelRecord (localStorage) and writeOptimisticLevelStats (the new
 * levelStats RxDB collection) run side by side for now — nothing reads from
 * the RxDB collection yet, that's a later ticket's job. Both stay correct
 * independently in the meantime.
 */
export function persistFinishedLevel(state: Finished): void {
  const { config, results, stars } = state;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  updateLevelRecord(config.levelNumber, { stars, totalTime });
  void writeOptimisticLevelStats(config.levelNumber, { stars, totalTime });

  const persistedTrials = buildPersistedTrials(config, results, state.runId);
  appendTrials(persistedTrials);

  void queueTrialResults(results, persistedTrials);
}
