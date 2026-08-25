import { getAppDatabase } from "../../db/database";
import { randomId } from "../../randomId";
import type { PersistedTrial } from "../../storage/trialHistory";
import type { TrialResult } from "../../game/index";
import type { TrialResultDocType } from "./schema";

/**
 * Writes a finished Level's Trials into the local trialResults collection —
 * the actual delivery to the backend happens in the background via that
 * collection's push replication (see replication.ts), retried automatically
 * even if the device is offline right now. `trials` is the already-built
 * PersistedTrial[] (the same ones written to local trial history, so
 * playedAt matches instead of a second, independently-generated timestamp);
 * `results` is the original TrialResult[] it was built from, in the same
 * order, used only for operands/answer — verifiable data not kept in local
 * trial history.
 */
export async function queueTrialResults(results: TrialResult[], trials: PersistedTrial[]): Promise<void> {
  const docs: TrialResultDocType[] = trials.map((t, i) => ({
    id: randomId(),
    levelNumber: t.levelNumber,
    categoryCodename: t.categoryCodename,
    operands: results[i].operation.operands(),
    answer: results[i].answer,
    timeTaken: t.timeTaken,
    playedAt: new Date(t.playedAt).getTime(), // backend stores epoch ms, not ISO
    keystrokes: t.keystrokes,
    hintShown: t.hintShown,
    streakAtSubmit: t.streakAtSubmit,
    hintsAvailableAtStart: t.hintsAvailableAtStart,
    levelRunId: t.levelRunId,
    clientCorrect: t.correct,
    clientTimeExceeded: t.timeExceeded,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
  }));

  try {
    const db = await getAppDatabase();
    // bulkInsert() resolves with { success, error } — it does NOT reject for
    // a per-document write failure, only for something wrong with the call
    // itself (e.g. the database failing to open). Both cases need handling.
    const { error } = await db.trialResults.bulkInsert(docs);
    if (error.length > 0) {
      // Unlike a failed *sync* (which RxDB's replication retries
      // automatically once queued), a failed *local write* means these
      // specific Trials were never queued at all — there's no retry path for
      // that, but it must still be visible rather than silently vanishing.
      console.error(`Couldn't queue ${error.length} Trial result(s) for sync:`, error);
    }
  } catch (error) {
    console.error("Couldn't queue Trial results for sync:", error);
  }
}
