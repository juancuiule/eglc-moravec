import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "./config.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerLevelsRoutes } from "./routes/levels.js";

export function buildApp(db: DatabaseSync, config: Config): FastifyInstance {
  const app = Fastify({
    logger: config.prettyPrintLogs
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : true,
  });
  // Auth is per-request Bearer tokens, not cookies, so a permissive origin
  // carries no CSRF risk — callers still need a real token to do anything.
  void app.register(cors, { origin: config.corsOrigin });
  registerHealthRoute(app, db);
  registerAuthRoutes(app, db, config);
  registerSyncRoutes(app, db);
  registerAdminRoutes(app, db);
  registerLevelsRoutes(app, db);
  return app;
}
