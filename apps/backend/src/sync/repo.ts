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

export type ActivityDayRow = { day: string; trials: number };

/**
 * Trials grouped by calendar day — the cheap aggregate behind "days trained"
 * counters that avoids shipping every row to the client just to count days.
 * `localShiftMs` shifts epoch ms into the viewer's local timezone before
 * date() buckets, so a 23:30 local session lands on the day the player saw.
 */
export function getActivityPerDay(
  db: DatabaseSync,
  emailHash: string,
  localShiftMs: number,
): ActivityDayRow[] {
  return db
    .prepare(
      `SELECT date((played_at + ?) / 1000, 'unixepoch') AS day,
              COUNT(*) AS trials
       FROM trial_results
       WHERE email_hash = ?
       GROUP BY day
       ORDER BY day`,
    )
    .all(localShiftMs, emailHash) as ActivityDayRow[];
}
