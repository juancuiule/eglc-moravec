import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getLevelNumbers, getLevelMix, getAllLevels } from "../levels/repo.js";
import { parseBody } from "../parser.js";
import * as z from "zod";

export function registerLevelsRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
): void {
  app.get("/levels", async (_, reply) => {
    return reply.send({ levels: getLevelNumbers(db) });
  });

  // The whole catalog in one read — for a client warming its offline cache.
  // Registered before :levelNumber, though find-my-way prefers static over
  // parametric regardless ("all" would otherwise fail the integer regex).
  app.get("/levels/all", async (_, reply) => {
    return reply.send({ levels: getAllLevels(db) });
  });

  app.get("/levels/:levelNumber", async (request, reply) => {
    const { levelNumber } = parseBody(
      request.params,
      z.object({
        levelNumber: z
          .string()
          .regex(
            /^\d+$/,
            "levelNumber must be a string representing an integer",
          )
          .transform(Number),
      }),
    );

    const mix = getLevelMix(db, levelNumber);
    if (mix === null) return reply.code(404).send({ error: "not_found" });

    return reply.send({ levelNumber, mix });
  });
}
