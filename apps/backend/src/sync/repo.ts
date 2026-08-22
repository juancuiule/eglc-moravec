import type { DatabaseSync } from "node:sqlite";
import type { TrialResultInput } from "./logic.js";

export type LevelStatsRow = {
  email_hash: string;
  level_number: number;
  stars: number;
  total_time: number;
  completed_at: number;
};

export function getLevelStatsRow(
  db: DatabaseSync,
  emailHash: string,
  levelNumber: number,
): LevelStatsRow | undefined {
  return db
    .prepare("SELECT * FROM level_stats WHERE email_hash = ? AND level_number = ?")
    .get(emailHash, levelNumber) as LevelStatsRow | undefined;
}

export function upsertLevelStatsRow(
  db: DatabaseSync,
  emailHash: string,
  levelNumber: number,
  stars: number,
  totalTime: number,
  completedAt: number,
): void {
  db.prepare(
    `INSERT INTO level_stats (email_hash, level_number, stars, total_time, completed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email_hash, level_number) DO UPDATE SET
       stars = excluded.stars,
       total_time = excluded.total_time,
       completed_at = excluded.completed_at`,
  ).run(emailHash, levelNumber, stars, totalTime, completedAt);
}

export function getAllLevelStatsForUser(db: DatabaseSync, emailHash: string): LevelStatsRow[] {
  return db
    .prepare("SELECT * FROM level_stats WHERE email_hash = ?")
    .all(emailHash) as LevelStatsRow[];
}

export function insertTrialResults(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly TrialResultInput[],
): void {
  const insertTrial = db.prepare(
    `INSERT INTO trial_results
       (email_hash, level_number, category_codename, correct, time_exceeded, time_taken, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeystroke = db.prepare(
    `INSERT INTO trial_keystrokes (trial_result_id, key, t) VALUES (?, ?, ?)`,
  );
  trials.forEach((t) => {
    const { lastInsertRowid } = insertTrial.run(
      emailHash,
      t.levelNumber,
      t.categoryCodename,
      t.correct ? 1 : 0,
      t.timeExceeded ? 1 : 0,
      t.timeTaken,
      t.playedAt,
    );
    t.keystrokes.forEach((k) => {
      insertKeystroke.run(lastInsertRowid, k.key, k.t);
    });
  });
}

export type TrialResultRow = {
  id: number;
  email_hash: string;
  level_number: number;
  category_codename: string;
  correct: number;
  time_exceeded: number;
  time_taken: number;
  played_at: number;
};

export function getTrialResultsForUser(db: DatabaseSync, emailHash: string): TrialResultRow[] {
  return db
    .prepare("SELECT * FROM trial_results WHERE email_hash = ? ORDER BY id")
    .all(emailHash) as TrialResultRow[];
}

export type KeystrokeRow = {
  id: number;
  trial_result_id: number;
  key: string;
  t: number;
};

export function getKeystrokesForTrialResult(
  db: DatabaseSync,
  trialResultId: number,
): KeystrokeRow[] {
  return db
    .prepare("SELECT * FROM trial_keystrokes WHERE trial_result_id = ? ORDER BY id")
    .all(trialResultId) as KeystrokeRow[];
}
