import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import {
  parseTrialResults,
  isBetterLevelRecord,
  evaluateTrialResult,
  deriveLevelStats,
} from "../sync/logic.js";
import {
  insertTrialResults,
  getLevelStatsRow,
  upsertLevelStatsRow,
  getAllLevelStatsForUser,
} from "../sync/repo.js";

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post("/sync/results", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = parseTrialResults(request.body);
    if (trials === null) return reply.code(400).send({ error: "invalid_request" });

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    deriveLevelStats(evaluated).forEach((ls) => {
      const existing = getLevelStatsRow(db, emailHash, ls.levelNumber);
      const existingRecord = existing ? { stars: existing.stars, totalTime: existing.total_time } : null;
      if (isBetterLevelRecord(ls, existingRecord)) {
        upsertLevelStatsRow(db, emailHash, ls.levelNumber, ls.stars, ls.totalTime, Date.now());
      }
    });

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
}
