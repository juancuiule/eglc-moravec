import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getLevelPerformance, getCategoryPerformance } from "../admin/repo.js";
import { summarizeLevelPerformance, summarizeCategoryPerformance } from "../admin/logic.js";

// No auth — matches the current deploy reality (not publicly exposed yet).
// Not linked from any frontend nav either; see ticket 05.
export function registerAdminRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get("/admin/stats", async (_request, reply) => {
    const byLevel = summarizeLevelPerformance(getLevelPerformance(db));
    const byCategory = summarizeCategoryPerformance(getCategoryPerformance(db));
    return reply.send({ byLevel, byCategory });
  });
}
