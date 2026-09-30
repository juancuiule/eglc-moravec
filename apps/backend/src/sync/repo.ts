import type { EvaluatedTrialResult } from "engine";
import type { DatabaseSync } from "node:sqlite";

export function insertTrialResults(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly EvaluatedTrialResult[],
): void {
  const insertTrial = db.prepare(
    `INSERT OR IGNORE INTO trial_results
       (id, email_hash, level_number, category_codename, operands, answer, correct, time_exceeded, time_taken, played_at, hint_shown, run_id, run_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // One transaction for the whole batch — without it each .run() is its own
  // autocommitted write, i.e. an fsync per row on the Pi's SD card.
  db.exec("BEGIN IMMEDIATE");
  try {
    trials.forEach((t) => {
      insertTrial.run(
        t.id,
        emailHash,
        t.levelNumber ?? 0, // the one place the Practice sentinel is materialized
        t.categoryCodename,
        JSON.stringify(t.operands),
        t.answer,
        t.correct ? 1 : 0,
        t.timeExceeded ? 1 : 0,
        t.timeTaken,
        t.playedAt,
        t.hintShown ? 1 : 0,
        t.runId,
        t.runType,
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// POST /sync's whole effect in one transaction: push batch + sync_log
// append + incremental pull. The transaction matters beyond fsync batching
// — a sync_log entry must exist iff its trial insert landed, and the pull
// must see exactly the rows committed before it.
//
// Returns { cursor, rows }: cursor is the max seq observed for this user
// (never below the requested one), rows are the trial_results behind
// seq > cursor minus this request's own pushed ids. The own-push exclusion
// is bandwidth only — merging them back would be idempotent anyway.
export function syncTrials(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly EvaluatedTrialResult[],
  cursor: number,
): { cursor: number; rows: TrialResultRow[] } {
  const insertTrial = db.prepare(
    `INSERT OR IGNORE INTO trial_results
       (id, email_hash, level_number, category_codename, operands, answer, correct, time_exceeded, time_taken, played_at, hint_shown, run_id, run_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLog = db.prepare(
    `INSERT INTO sync_log (email_hash, trial_id, created_at) VALUES (?, ?, ?)`,
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    trials.forEach((t) => {
      const result = insertTrial.run(
        t.id,
        emailHash,
        t.levelNumber ?? 0, // the one place the Practice sentinel is materialized
        t.categoryCodename,
        JSON.stringify(t.operands),
        t.answer,
        t.correct ? 1 : 0,
        t.timeExceeded ? 1 : 0,
        t.timeTaken,
        t.playedAt,
        t.hintShown ? 1 : 0,
        t.runId,
        t.runType,
      );
      // A retried push of a known id changes nothing — and must not grow
      // the log, or the device sees its own data as "new" forever.
      if (Number(result.changes) > 0) {
        insertLog.run(emailHash, t.id, t.playedAt);
      }
    });

    const ownIds = new Set(trials.map((t) => t.id));
    const maxSeq =
      (
        db
          .prepare("SELECT MAX(seq) AS m FROM sync_log WHERE email_hash = ?")
          .get(emailHash) as { m: number | null }
      ).m ?? 0;
    const newCursor = Math.max(maxSeq, cursor);

    // The join keeps append order (seq), not played_at — same-timestamp rows
    // still come back in the order they were committed.
    const rows = (
      db
        .prepare(
          `SELECT t.* FROM sync_log s
           JOIN trial_results t ON t.id = s.trial_id
           WHERE s.email_hash = ? AND s.seq > ?
           ORDER BY s.seq`,
        )
        .all(emailHash, cursor) as TrialResultRow[]
    ).filter((r) => !ownIds.has(r.id));

    db.exec("COMMIT");
    return { cursor: newCursor, rows };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type TrialResultRow = {
  id: string;
  email_hash: string;
  level_number: number;
  category_codename: string;
  operands: string; // JSON array of numbers
  answer: number | null;
  correct: number;
  time_exceeded: number;
  time_taken: number;
  played_at: number;
  hint_shown: number;
  run_id: string;
  run_type: string;
};

export function getTrialResultsForUser(
  db: DatabaseSync,
  emailHash: string,
): TrialResultRow[] {
  return db
    .prepare(
      "SELECT * FROM trial_results WHERE email_hash = ? ORDER BY played_at",
    )
    .all(emailHash) as TrialResultRow[];
}
