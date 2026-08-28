import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getLevelNumbers, getLevelMix, getAllLevels } from "../levels/repo.js";

/**
 * Public, unauthenticated — level content isn't sensitive, and Home's
 * level grid needs to work even before a session exists.
 */
export function registerLevelsRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get("/levels", async (request, reply) => {
    return reply.send({ levels: getLevelNumbers(db) });
  });

  // Registered before the :levelNumber param route in source, though Fastify
  // (find-my-way) would prefer this static path over the parametric one
  // regardless of registration order — the whole catalog in one response,
  // for a client warming its offline cache rather than reading one Level at
  // a time via the route below.
  app.get("/levels/all", async (request, reply) => {
    return reply.send({ levels: getAllLevels(db) });
  });

  app.get("/levels/:levelNumber", async (request, reply) => {
    const raw = (request.params as { levelNumber: string }).levelNumber;
    const levelNumber = Number(raw);
    if (!Number.isInteger(levelNumber)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const mix = getLevelMix(db, levelNumber);
    if (mix === null) return reply.code(404).send({ error: "not_found" });

    return reply.send({ levelNumber, mix });
  });
}
