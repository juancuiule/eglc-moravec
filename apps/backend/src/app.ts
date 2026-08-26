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
  app.setErrorHandler<Error & { statusCode?: number; code?: string }>((error, request, reply) => {
    request.log.error({ err: error }, "unhandled request error");

    // Fastify (and any code that deliberately throws a client-facing error)
    // sets statusCode on the error itself; an unset/500 statusCode means an
    // unexpected internal failure whose raw message must not reach the
    // client. Expected 4xx errors carry no sensitive detail, so their own
    // code/message are safe to pass through.
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({ error: error.code ?? "bad_request" });
      return;
    }

    reply.code(500).send({ error: "internal_error" });
  });
  registerHealthRoute(app, db);
  registerAuthRoutes(app, db, config);
  registerSyncRoutes(app, db);
  registerAdminRoutes(app, db);
  registerLevelsRoutes(app, db);
  return app;
}
