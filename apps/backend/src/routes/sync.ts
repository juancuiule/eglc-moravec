import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireEmailHash } from "../auth/session";
import {
  parseTrialResults,
  evaluateTrialResult,
  deriveLevelStats,
} from "../sync/logic";
import {
  insertTrialResults,
  getTrialResultsForUser,
  type TrialResultRow,
} from "../sync/repo";

export function registerSyncRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
): void {
  app.post("/sync/results", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const trials = parseTrialResults(request.body);
    if (trials === null) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    return reply.send({ ok: true, stored: trials.length });
  });

  app.get("/sync/level-stats", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const rows = getTrialResultsForUser(db, emailHash).filter(
      (r) => r.run_type === "level",
    );

    const stats = deriveLevelStats(
      rows.map((r) => ({
        levelNumber: r.level_number,
        correct: Boolean(r.correct),
        timeTaken: r.time_taken,
        playedAt: r.played_at,
        runId: r.run_id,
      })),
    );
    const levelStats = Object.fromEntries(
      stats.map((s) => [
        String(s.levelNumber),
        {
          stars: s.stars,
          totalTime: s.totalTime,
          completedAt: new Date(s.completedAt).toISOString(),
        },
      ]),
    );

    return reply.send({ levelStats });
  });

  app.get("/sync/trials", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const trials = getTrialResultsForUser(db, emailHash).map(
      (r: TrialResultRow) => ({
        categoryCodename: r.category_codename,
        correct: Boolean(r.correct),
        timeExceeded: Boolean(r.time_exceeded),
        timeTaken: r.time_taken,
        runType: r.run_type,
      }),
    );

    return reply.send({ trials });
  });
}
