import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { isDbReachable } from "../db.js";

export function registerHealthRoute(app: FastifyInstance, db: DatabaseSync): void {
  app.get("/health", async (_request, reply) => {
    const dbOk = isDbReachable(db);
    return reply.code(dbOk ? 200 : 503).send({ status: dbOk ? "ok" : "degraded", db: dbOk });
  });
}
