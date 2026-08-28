import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import { parseTrialResults, evaluateTrialResult, deriveLevelRuns } from "../sync/logic.js";
import {
  insertTrialResults,
  insertLevelRuns,
  upsertLevelStatsIfBetter,
  getAllLevelStatsForUser,
  getTrialResultsSince,
  getLevelRunsSince,
  getKeystrokesForTrialResult,
} from "../sync/repo.js";

function parseCursorParam(raw: unknown): number | null {
  if (raw === undefined) return 0;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post("/sync/results", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = parseTrialResults(request.body);
    if (trials === null) return reply.code(400).send({ error: "invalid_request" });

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    const levelTrials = evaluated.filter((t) => t.runType === "level");
    if (levelTrials.length > 0) {
      const runs = deriveLevelRuns(levelTrials);
      insertLevelRuns(db, emailHash, runs, Date.now());

      const syncedAt = Date.now();
      runs.forEach((run) => {
        upsertLevelStatsIfBetter(db, emailHash, run.levelNumber, run, syncedAt);
      });
    }

    return reply.send({ ok: true, stored: trials.length });
  });

  app.get("/sync/level-stats", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const rows = getAllLevelStatsForUser(db, emailHash);
    const levelStats = Object.fromEntries(
      rows.map((r) => [
        String(r.level_number),
        { stars: r.stars, totalTime: r.total_time, completedAt: new Date(r.completed_at).toISOString() },
      ]),
    );

    return reply.send({ levelStats });
  });

  // Cursor-based pull for offline-first devices (ADR-0001): returns every
  // trial_results/level_runs row newer than the given cursor, trial
  // keystrokes nested under their parent row. sinceTrialId/sinceRunSeq
  // default to 0 (everything) when omitted.
  app.get("/sync/pull", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const query = request.query as Record<string, unknown>;
    const sinceTrialId = parseCursorParam(query.sinceTrialId);
    const sinceRunSeq = parseCursorParam(query.sinceRunSeq);
    if (sinceTrialId === null || sinceRunSeq === null) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const trialRows = getTrialResultsSince(db, emailHash, sinceTrialId);
    const runRows = getLevelRunsSince(db, emailHash, sinceRunSeq);

    const trialResults = trialRows.map((r) => ({
      id: r.id,
      levelNumber: r.level_number,
      categoryCodename: r.category_codename,
      correct: r.correct === 1,
      timeExceeded: r.time_exceeded === 1,
      clientCorrect: r.client_correct === 1,
      clientTimeExceeded: r.client_time_exceeded === 1,
      timeTaken: r.time_taken,
      playedAt: r.played_at,
      hintShown: r.hint_shown === 1,
      streakAtSubmit: r.streak_at_submit,
      hintsAvailableAtStart: r.hints_available_at_start,
      runId: r.run_id,
      runType: r.run_type,
      keystrokes: getKeystrokesForTrialResult(db, r.id).map((k) => ({ key: k.key, t: k.t })),
    }));

    const levelRuns = runRows.map((r) => ({
      id: r.id,
      levelNumber: r.level_number,
      stars: r.stars,
      totalTime: r.total_time,
      levelCompleted: r.level_completed === 1,
      playedAt: r.played_at,
      serverSeq: r.server_seq,
    }));

    const cursor = {
      trialId: trialRows.length > 0 ? trialRows[trialRows.length - 1].id : sinceTrialId,
      runSeq: runRows.length > 0 ? runRows[runRows.length - 1].server_seq : sinceRunSeq,
    };

    return reply.send({ trialResults, levelRuns, cursor });
  });
}
