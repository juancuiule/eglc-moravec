import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import { parseTrialResults, evaluateTrialResult, deriveLevelStats } from "../sync/logic.js";
import { insertTrialResults, getTrialResultsForUser, type TrialResultRow } from "../sync/repo.js";

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post("/sync/results", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = parseTrialResults(request.body);
    if (trials === null) return reply.code(400).send({ error: "invalid_request" });

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    return reply.send({ ok: true, stored: trials.length });
  });

  app.get("/sync/level-stats", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const rows = getTrialResultsForUser(db, emailHash).filter(
      (r: TrialResultRow) => r.run_type === "level",
    );
    const stats = deriveLevelStats(
      rows.map((r) => ({
        levelNumber: r.level_number,
        correct: r.correct === 1,
        timeTaken: r.time_taken,
        playedAt: r.played_at,
        runId: r.run_id,
      })),
    );
    const levelStats = Object.fromEntries(
      stats.map((s) => [
        String(s.levelNumber),
        { stars: s.stars, totalTime: s.totalTime, completedAt: new Date(s.completedAt).toISOString() },
      ]),
    );

    return reply.send({ levelStats });
  });

  // The frontend keeps no local trial history anymore — the Stats screen's
  // per-category effectiveness/histogram is computed client-side (see
  // stats/computeStats.ts) over whatever this returns, every time it loads.
  app.get("/sync/trials", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = getTrialResultsForUser(db, emailHash).map((r: TrialResultRow) => ({
      categoryCodename: r.category_codename,
      correct: r.correct === 1,
      timeExceeded: r.time_exceeded === 1,
      timeTaken: r.time_taken,
      runType: r.run_type,
    }));

    return reply.send({ trials });
  });
}
