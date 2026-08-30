import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoute } from "./routes/health";
import { registerLevelsRoutes } from "./routes/levels";
import { registerSyncRoutes } from "./routes/sync";

export function buildApp(db: DatabaseSync, config: Config): FastifyInstance {
  const app = Fastify({
    logger: config.prettyPrintLogs
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
              messageFormat: "{msg}",
            },
          },
        }
      : true,

    disableRequestLogging: true,
  });

  app.addHook("onRequest", async (request) => {
    app.log.info(`${request.id} - ${request.method} - ${request.url}`);
  });

  app.addHook("onResponse", async (request, reply) => {
    app.log.info(
      `${request.id} - ${reply.statusCode} - ${reply.elapsedTime.toFixed(2)}ms`,
    );
  });

  void app.register(cors, { origin: config.corsOrigin });
  app.setErrorHandler<Error & { statusCode?: number; code?: string }>(
    (error, request, reply) => {
      request.log.error({ err: error }, "unhandled request error");

      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 400 && statusCode < 500) {
        reply.code(statusCode).send({ error: error.code ?? "bad_request" });
        return;
      }

      reply.code(500).send({ error: "internal_error" });
    },
  );

  registerHealthRoute(app, db);
  registerAuthRoutes(app, db, config);
  registerSyncRoutes(app, db);
  registerLevelsRoutes(app, db);

  return app;
}
