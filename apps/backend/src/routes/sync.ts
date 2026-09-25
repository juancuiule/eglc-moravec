import {
  TrialResultsSchema,
  deriveLevelStats,
  evaluateTrialResult,
} from "engine";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireEmailHash } from "../auth/session.js";
import { parseBody } from "../parser.js";
import {
  getActivityPerDay,
  getTrialResultsForUser,
  insertTrialResults,
  type TrialResultRow,
} from "../sync/repo.js";

export function registerSyncRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
): void {
  app.post("/sync/results", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    const { trials } = parseBody(request.body, TrialResultsSchema);

    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated);

    return reply.send({ ok: true, trials: evaluated });
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
        id: r.id,
        categoryCodename: r.category_codename,
        operands: JSON.parse(r.operands) as number[],
        answer: r.answer,
        correct: Boolean(r.correct),
        timeExceeded: Boolean(r.time_exceeded),
        timeTaken: r.time_taken,
        playedAt: r.played_at,
        hintShown: Boolean(r.hint_shown),
        runType: r.run_type,
        runId: r.run_id,
        // Practice rows store the level_number=0 sentinel; the wire shape
        // restores the domain's null.
        levelNumber: r.run_type === "practice" ? null : r.level_number,
      }),
    );

    return reply.send({ trials });
  });

  app.get("/sync/activity", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;

    // tzOffsetMinutes follows the getTimezoneOffset() convention (minutes to
    // add to local time to reach UTC — positive west of Greenwich).
    const { tzOffsetMinutes } = request.query as { tzOffsetMinutes?: string };
    const parsed = tzOffsetMinutes === undefined ? 0 : Number(tzOffsetMinutes);
    if (!Number.isInteger(parsed) || Math.abs(parsed) > 14 * 60) {
      return reply.status(400).send({ error: "invalid_tz_offset" });
    }
    const localShiftMs = -parsed * 60_000;

    const days = getActivityPerDay(db, emailHash, localShiftMs);
    return reply.send({ days });
  });
}
