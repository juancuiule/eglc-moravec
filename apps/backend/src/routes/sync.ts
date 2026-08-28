import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import {
  parseSyncRequest,
  evaluateTrialResult,
  deriveLevelRuns,
  buildSyncResponsePlan,
  toWireTrial,
  toWireLevelRun,
} from "../sync/logic.js";
import {
  insertTrialResults,
  insertLevelRuns,
  getSyncLogSince,
  getTrialResultsByIds,
  getLevelRunsByIds,
} from "../sync/repo.js";

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post("/sync", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const parsed = parseSyncRequest(request.body);
    if (parsed === null) return reply.code(400).send({ error: "invalid_request" });
    const { cursor, trials } = parsed;

    const now = Date.now();
    const evaluated = trials.map(evaluateTrialResult);
    insertTrialResults(db, emailHash, evaluated, now);

    const levelTrials = evaluated.filter((t) => t.runType === "level");
    const runs = levelTrials.length > 0 ? deriveLevelRuns(levelTrials) : [];
    insertLevelRuns(db, emailHash, runs, now);

    const pushedTrialIds = new Set(evaluated.map((t) => t.id));
    const pushedLevelRunIds = new Set(runs.map((r) => r.levelRunId));

    const log = getSyncLogSince(db, emailHash, cursor);
    const plan = buildSyncResponsePlan(log, cursor, pushedTrialIds, pushedLevelRunIds);

    return reply.send({
      cursor: plan.newCursor,
      trials: getTrialResultsByIds(db, plan.trialIdsToFetch).map(toWireTrial),
      levelRuns: getLevelRunsByIds(db, plan.levelRunIdsToFetch).map(toWireLevelRun),
    });
  });
}
