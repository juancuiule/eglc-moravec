import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getLevelNumbers, getLevelMix } from "../levels/repo.js";

export function registerLevelsRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get("/levels", async (request, reply) => {
    return reply.send({ levels: getLevelNumbers(db) });
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
