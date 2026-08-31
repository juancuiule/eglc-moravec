import {
  TrialResultSchema,
  deriveLevelStats,
  evaluateTrialResult,
} from "engine";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import * as z from "zod";
import { requireEmailHash } from "../auth/session";
import { parseBody } from "../parser";
import {
  getTrialResultsForUser,
  insertTrialResults,
  type TrialResultRow,
} from "../sync/repo";

export function registerSyncRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
): void {
  app.post("/sync/results", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const { trials } = parseBody(
      request.body,
      z.object({ trials: z.array(TrialResultSchema) }),
    );

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    return reply.send({ ok: true, trials: evaluated });
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
          ...s,
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
