import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerToken, resolveEmailHash } from "../auth/session.js";
import {
  parseTrialResultPushes,
  evaluateTrialResult,
  deriveLevelRuns,
  type TrialResultPushInput,
} from "../sync/logic.js";
import {
  insertTrialResults,
  insertLevelRuns,
  upsertLevelStatsIfBetter,
  getAllLevelStatsForUser,
  getTrialResultById,
} from "../sync/repo.js";

export function registerSyncRoutes(app: FastifyInstance, db: DatabaseSync): void {
  /**
   * RxDB push-replication endpoint for the trialResults collection (see
   * apps/frontend/src/sync/trialResults). Every pushed Trial comes back
   * enriched with its authoritative correct/timeExceeded, computed here
   * independently from its raw operands/answer/timeTaken — never trusting
   * the client's own claim, which is still kept (as clientCorrect/
   * clientTimeExceeded) for auditing, exactly as before this endpoint
   * replaced the old fire-and-forget POST /sync/results.
   */
  app.post("/sync/trial-results/push", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });

    const trials = parseTrialResultPushes(request.body);
    if (trials === null) return reply.code(400).send({ error: "invalid_request" });

    const evaluated = trials.map(evaluateTrialResult);
    const newlyInserted = insertTrialResults(db, emailHash, evaluated);

    // level_runs/level_stats only need to account for Trials actually new
    // this call — a duplicate (already recorded from an earlier push) was
    // already folded into them the first time it arrived.
    if (newlyInserted.length > 0) {
      const runs = deriveLevelRuns(newlyInserted);
      const syncedAt = Date.now();
      insertLevelRuns(db, emailHash, runs, syncedAt);
      runs.forEach((run) => {
        upsertLevelStatsIfBetter(db, emailHash, run.levelNumber, run, syncedAt);
      });
    }

    const newlyInsertedById = new Map(newlyInserted.map((t) => [t.id, t]));
    // trials/evaluated are parallel arrays (evaluated = trials.map(...)
    // above), so pairing by index needs no lookup that could ever miss.
    const responseTrials = trials.map((input, i) =>
      authoritativeTrial(db, emailHash, input, evaluated[i], newlyInsertedById),
    );

    return reply.send({ trials: responseTrials });
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

/**
 * Rebuilds the full wire document RxDB's replication protocol expects back:
 * the pushed Trial's own fields, with correct/timeExceeded replaced by
 * whatever is actually authoritative — either what was just computed (a
 * newly-inserted Trial) or what an earlier push already recorded (a
 * duplicate this push re-submitted).
 */
function authoritativeTrial(
  db: DatabaseSync,
  emailHash: string,
  input: TrialResultPushInput,
  evaluated: { correct: boolean; timeExceeded: boolean },
  newlyInsertedById: Map<string, { correct: boolean; timeExceeded: boolean }>,
): TrialResultPushInput & { correct: boolean; timeExceeded: boolean } {
  const inserted = newlyInsertedById.get(input.id);
  const authoritative = inserted ?? existingOrFallbackCorrectness(db, emailHash, input.id, evaluated);
  return { ...input, correct: authoritative.correct, timeExceeded: authoritative.timeExceeded };
}

function existingOrFallbackCorrectness(
  db: DatabaseSync,
  emailHash: string,
  id: string,
  fallback: { correct: boolean; timeExceeded: boolean },
): { correct: boolean; timeExceeded: boolean } {
  const existing = getTrialResultById(db, emailHash, id);
  if (existing) return { correct: !!existing.correct, timeExceeded: !!existing.time_exceeded };
  // INSERT OR IGNORE reported this id as already existing, but no row for
  // it exists under this user — since ids are globally unique (not scoped
  // per user) but client-generated, this means an id collision with a
  // different user's Trial (astronomically unlikely — randomId() is a full
  // UUID). Never trust a stranger's row: fall back to this request's own
  // independently-recomputed value instead of crashing the whole push, and
  // log it so a real collision is investigable rather than silently
  // misattributed.
  console.error(`Trial ${id}: id collided with another user's row, falling back to this request's own recomputation`);
  return fallback;
}
