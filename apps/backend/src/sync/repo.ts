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

export function mergeAnonymousIdentity(
  db: DatabaseSync,
  from: string,
  to: string,
  now: number,
): void {
  db.prepare(
    "UPDATE trial_results SET email_hash = ? WHERE email_hash = ?",
  ).run(to, from);
}
