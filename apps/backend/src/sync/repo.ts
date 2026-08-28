import type { DatabaseSync } from "node:sqlite";
import type { EvaluatedTrialResult, LevelRunSummary, SyncLogEntry } from "./logic.js";

/**
 * Appends a sync_log row only when the caller tells us an insert actually
 * happened (see the `.changes` check at each call site) — a retried
 * INSERT OR IGNORE that hit an existing id must not grow the log, or a
 * device would see its own already-synced data as "new" forever.
 */
function logSyncEntry(
  db: DatabaseSync,
  entityType: SyncLogEntry["entityType"],
  entityId: string,
  emailHash: string,
  now: number,
): void {
  db.prepare(
    `INSERT INTO sync_log (entity_type, entity_id, email_hash, created_at) VALUES (?, ?, ?, ?)`,
  ).run(entityType, entityId, emailHash, now);
}

export function insertTrialResults(
  db: DatabaseSync,
  emailHash: string,
  trials: readonly EvaluatedTrialResult[],
  now: number,
): void {
  const insertTrial = db.prepare(
    `INSERT OR IGNORE INTO trial_results
       (id, email_hash, level_number, category_codename, correct, time_exceeded, client_correct, client_time_exceeded, time_taken, played_at, hint_shown, streak_at_submit, hints_available_at_start, run_id, run_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeystroke = db.prepare(
    `INSERT INTO trial_keystrokes (trial_result_id, key, t) VALUES (?, ?, ?)`,
  );
  trials.forEach((t) => {
    const { changes } = insertTrial.run(
      t.id,
      emailHash,
      t.levelNumber ?? 0, // the one place the Practice sentinel is materialized
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
      t.runId,
      t.runType,
    );
    if (changes === 0) return; // a retried push of an id we already have — keystrokes are already stored too

    t.keystrokes.forEach((k) => {
      insertKeystroke.run(t.id, k.key, k.t);
    });
    logSyncEntry(db, "trial_result", t.id, emailHash, now);
  });
}

export type TrialResultRow = {
  id: string;
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
  run_id: string;
  run_type: string;
};

export function getTrialResultsForUser(db: DatabaseSync, emailHash: string): TrialResultRow[] {
  return db
    .prepare("SELECT * FROM trial_results WHERE email_hash = ? ORDER BY id")
    .all(emailHash) as TrialResultRow[];
}

/** Fetches specific trials by id — used to hydrate a POST /sync pull response. */
export function getTrialResultsByIds(db: DatabaseSync, ids: readonly string[]): TrialResultRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(`SELECT * FROM trial_results WHERE id IN (${placeholders})`)
    .all(...ids) as TrialResultRow[];
}

export type KeystrokeRow = {
  id: number;
  trial_result_id: string;
  key: string;
  t: number;
};

export function getKeystrokesForTrialResult(
  db: DatabaseSync,
  trialResultId: string,
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
 * Records every attempt at a Level, not just the best — LevelStats (the
 * best-ever record) is derived client-side from this table, not stored here.
 * `INSERT OR IGNORE` because id (the client-generated levelRunId) is a
 * natural dedup key: a retried sync of the same batch should not
 * double-record the same run.
 */
export function insertLevelRuns(
  db: DatabaseSync,
  emailHash: string,
  runs: readonly LevelRunSummary[],
  now: number,
): void {
  const insertRun = db.prepare(
    `INSERT OR IGNORE INTO level_runs (id, email_hash, level_number, stars, total_time, level_completed, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  runs.forEach((run) => {
    const { changes } = insertRun.run(
      run.levelRunId,
      emailHash,
      run.levelNumber,
      run.stars,
      run.totalTime,
      run.levelCompleted ? 1 : 0,
      now,
    );
    if (changes === 0) return;

    logSyncEntry(db, "level_run", run.levelRunId, emailHash, now);
  });
}

export function getLevelRunsForUser(db: DatabaseSync, emailHash: string): LevelRunRow[] {
  return db
    .prepare("SELECT * FROM level_runs WHERE email_hash = ? ORDER BY played_at")
    .all(emailHash) as LevelRunRow[];
}

/** Fetches specific level runs by id — used to hydrate a POST /sync pull response. */
export function getLevelRunsByIds(db: DatabaseSync, ids: readonly string[]): LevelRunRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(`SELECT * FROM level_runs WHERE id IN (${placeholders})`)
    .all(...ids) as LevelRunRow[];
}

export type SyncLogRow = {
  seq: number;
  entity_type: string;
  entity_id: string;
};

/** Every sync_log entry for `emailHash` newer than `cursor`, oldest first. */
export function getSyncLogSince(
  db: DatabaseSync,
  emailHash: string,
  cursor: number,
): SyncLogEntry[] {
  const rows = db
    .prepare("SELECT seq, entity_type, entity_id FROM sync_log WHERE email_hash = ? AND seq > ? ORDER BY seq")
    .all(emailHash, cursor) as SyncLogRow[];
  return rows.map((r) => ({
    seq: r.seq,
    entityType: r.entity_type as SyncLogEntry["entityType"],
    entityId: r.entity_id,
  }));
}

/**
 * Folds an anonymous identity's data into a real, newly-verified one —
 * called once, server-side, at the moment of the email upgrade.
 * trial_results, level_runs, and sync_log are all append-only history, so
 * they just get re-keyed wholesale — there's no "best record" concept left
 * to resolve here now that LevelStats is derived client-side rather than
 * stored as its own entity. Re-keying sync_log (not just the two data
 * tables) keeps a device's already-stored cursor numerically valid across
 * the anonymous→login transition, with no special case needed client-side.
 * The caller is responsible for confirming `from` is actually an anonymous
 * user (see auth/repo.ts's isAnonymousUser) before calling this — merging
 * one real account into another would be a real data leak.
 */
export function mergeAnonymousIdentity(db: DatabaseSync, from: string, to: string): void {
  db.prepare("UPDATE trial_results SET email_hash = ? WHERE email_hash = ?").run(to, from);
  db.prepare("UPDATE level_runs SET email_hash = ? WHERE email_hash = ?").run(to, from);
  db.prepare("UPDATE sync_log SET email_hash = ? WHERE email_hash = ?").run(to, from);
}
