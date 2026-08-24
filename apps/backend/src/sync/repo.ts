import type { DatabaseSync } from "node:sqlite";
import type { EvaluatedTrialResult, LevelRunSummary } from "./logic.js";
import { isBetterLevelRecord } from "./logic.js";

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

/**
 * Overwrites the stored level_stats row only if `candidate` is actually a
 * better record than what's there — level_stats is a best-ever cache, never
 * just the latest attempt.
 */
export function upsertLevelStatsIfBetter(
  db: DatabaseSync,
  emailHash: string,
  levelNumber: number,
  candidate: { stars: number; totalTime: number },
  at: number,
): void {
  const existing = getLevelStatsRow(db, emailHash, levelNumber);
  const existingRecord = existing ? { stars: existing.stars, totalTime: existing.total_time } : null;
  if (isBetterLevelRecord(candidate, existingRecord)) {
    upsertLevelStatsRow(db, emailHash, levelNumber, candidate.stars, candidate.totalTime, at);
  }
}

export function insertTrialResults(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly EvaluatedTrialResult[],
): void {
  const insertTrial = db.prepare(
    `INSERT INTO trial_results
       (email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, level_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      t.clientCorrect ? 1 : 0,
      t.clientTimeExceeded ? 1 : 0,
      t.timeTaken,
      t.playedAt,
      t.hintShown ? 1 : 0,
      t.streakAtSubmit,
      t.hintsAvailableAtStart,
      t.levelRunId,
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
  client_correct: number;
  client_time_exceeded: number;
  time_taken: number;
  played_at: number;
  hint_shown: number;
  streak_at_submit: number;
  hints_available_at_start: number;
  level_run_id: string;
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

export type LevelRunRow = {
  id: string;
  email_hash: string;
  level_number: number;
  stars: number;
  total_time: number;
  level_completed: number;
  played_at: number;
};

/**
 * Records every attempt at a Level, not just the best — level_stats stays
 * the best-ever cache the Levels page reads. `INSERT OR IGNORE` because id
 * (the client-generated levelRunId) is a natural dedup key: a retried sync
 * of the same batch should not double-record the same run.
 */
export function insertLevelRuns(
  db: DatabaseSync,
  emailHash: string,
  runs: readonly LevelRunSummary[],
  playedAt: number,
): void {
  const insertRun = db.prepare(
    `INSERT OR IGNORE INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  runs.forEach((run) => {
    insertRun.run(
      run.levelRunId,
      emailHash,
      run.levelNumber,
      run.stars,
      run.totalTime,
      run.levelCompleted ? 1 : 0,
      playedAt,
    );
  });
}

export function getLevelRunsForUser(db: DatabaseSync, emailHash: string): LevelRunRow[] {
  return db
    .prepare("SELECT * FROM level_runs WHERE email_hash = ? ORDER BY played_at")
    .all(emailHash) as LevelRunRow[];
}

/**
 * Folds an anonymous identity's data into a real, newly-verified one —
 * called once, server-side, at the moment of the email upgrade.
 * trial_results and level_runs are append-only history, so
 * those just get re-keyed; level_stats has a "best record" concept, so
 * each level only overwrites the destination's row if it's actually
 * better (same comparison the ordinary email→email sync path already
 * uses). The caller is responsible for confirming `from` is actually an
 * anonymous user (see auth/repo.ts's isAnonymousUser) before calling this
 * — merging one real account into another would be a real data leak.
 */
export function mergeAnonymousIdentity(db: DatabaseSync, from: string, to: string, now: number): void {
  getAllLevelStatsForUser(db, from).forEach((row) => {
    upsertLevelStatsIfBetter(
      db,
      to,
      row.level_number,
      { stars: row.stars, totalTime: row.total_time },
      now,
    );
  });

  db.prepare("UPDATE trial_results SET email_hash = ? WHERE email_hash = ?").run(to, from);
  db.prepare("UPDATE level_runs SET email_hash = ? WHERE email_hash = ?").run(to, from);
}
