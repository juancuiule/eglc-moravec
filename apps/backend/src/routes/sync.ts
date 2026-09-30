import {
  SyncRequestSchema,
  deriveLevelStats,
  evaluateTrialResult,
  levelStatsToWire,
  type SyncedTrial,
} from "engine";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireEmailHash } from "../auth/session.js";
import { parseBody } from "../parser.js";
import {
  getTrialResultsForUser,
  syncTrials,
  type TrialResultRow,
} from "../sync/repo.js";

function rowToSyncedTrial(r: TrialResultRow): SyncedTrial {
  const base = {
    id: r.id,
    categoryCodename: r.category_codename,
    operands: JSON.parse(r.operands) as number[],
    answer: r.answer,
    correct: Boolean(r.correct),
    timeExceeded: Boolean(r.time_exceeded),
    timeTaken: r.time_taken,
    playedAt: r.played_at,
    hintShown: Boolean(r.hint_shown),
    runId: r.run_id,
  };
  // Practice rows (and Focus — same family, adaptive mix) store the
  // level_number=0 sentinel; the wire shape restores the domain's null —
  // and the discriminated union needs the matching literal in each branch.
  if (r.run_type === "practice_focus") {
    return { ...base, runType: "practice_focus", levelNumber: null };
  }
  return r.run_type === "practice"
    ? { ...base, runType: "practice", levelNumber: null }
    : { ...base, runType: "level", levelNumber: r.level_number };
}

export function registerSyncRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
): void {
  // The unified sync path: push the outbox batch and pull this user's
  // sync_log entries past the client's cursor in one round trip. email_hash
  // comes from the Bearer token, never the body (unchanged rule).
  app.post("/sync", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const { cursor, trials } = parseBody(request.body, SyncRequestSchema);

    const evaluated = trials.map(evaluateTrialResult);
    const { cursor: newCursor, rows } = syncTrials(
      db,
      emailHash,
      evaluated,
      cursor,
    );

    return reply.send({
      cursor: newCursor,
      trials: rows.map(rowToSyncedTrial),
    });
  });

  app.get("/sync/level-stats", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const rows = getTrialResultsForUser(db, emailHash);

    const stats = deriveLevelStats(
      rows.map((r) => ({
        levelNumber: r.level_number,
        correct: Boolean(r.correct),
        timeTaken: r.time_taken,
        playedAt: r.played_at,
        runId: r.run_id,
        runType: r.run_type,
      })),
    );

    return reply.send({ levelStats: levelStatsToWire(stats) });
  });

  app.get("/sync/trials", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const trials = getTrialResultsForUser(db, emailHash).map(rowToSyncedTrial);

    return reply.send({ trials });
  });
}
