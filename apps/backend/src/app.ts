import cors from "@fastify/cors";
import rateLimit, { normalizeIP } from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "./config";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerLevelsRoutes } from "./routes/levels.js";
import { registerSyncRoutes } from "./routes/sync.js";

export function buildApp(db: DatabaseSync, config: Config): FastifyInstance {
  const trustedProxyIp =
    config.trustedProxyIp === null
      ? null
      : normalizeIP(config.trustedProxyIp, 128);
  const app = Fastify({
    trustProxy:
      trustedProxyIp === null
        ? false
        : (address, hop) =>
            hop === 0 && normalizeIP(address, 128) === trustedProxyIp,
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
    app.log.info(
      `${request.id} - ${request.method} - ${request.routeOptions.url ?? "unmatched"}`,
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    app.log.info(
      `${request.id} - ${reply.statusCode} - ${reply.elapsedTime.toFixed(2)}ms`,
    );
  });

  void app.register(cors, { origin: config.corsOrigin });
  app.setErrorHandler<Error & { statusCode?: number; code?: string }>(
    (error, request, reply) => {
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 500) {
        request.log.error({ statusCode }, "unhandled request error");
      }
      if (statusCode >= 400 && statusCode < 500) {
        reply.code(statusCode).send({ error: error.code ?? "bad_request" });
        return;
      }

      reply.code(500).send({ error: "internal_error" });
    },
  );

  registerHealthRoute(app, db);
  void app.register(async (auth) => {
    await auth.register(rateLimit, {
      global: false,
      hook: "onRequest",
      ipv6Subnet: 64,
      continueExceeding: false,
      exponentialBackoff: false,
      errorResponseBuilder: () =>
        Object.assign(new Error("rate_limited"), {
          statusCode: 429,
          code: "rate_limited",
        }),
    });
    registerAuthRoutes(auth, db, config);
  });
  registerSyncRoutes(app, db);
  registerLevelsRoutes(app, db);

  return app;
}
