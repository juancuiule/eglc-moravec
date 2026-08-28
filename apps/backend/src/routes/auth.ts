import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "../config.js";
import {
  normalizeEmail,
  isValidEmail,
  hashEmail,
  hashDeviceId,
  isOtpValid,
} from "../auth/logic.js";
import { generateOtp, generateSessionToken } from "../auth/crypto.js";
import {
  getOtpRow,
  reserveOtpSlot,
  restoreOtpRow,
  incrementOtpAttempts,
  deleteOtpRow,
  upsertUser,
  isAnonymousUser,
  createSession,
  deleteSession,
} from "../auth/repo.js";
import { mergeAnonymousIdentity } from "../sync/repo.js";
import { sendOtpEmail } from "../auth/email.js";
import { bearerToken, resolveEmailHash } from "../auth/session.js";

export function registerAuthRoutes(app: FastifyInstance, db: DatabaseSync, config: Config): void {
  app.post("/auth/otp/request", async (request, reply) => {
    const body = request.body as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";

    if (!isValidEmail(email)) {
      return reply.code(400).send({ error: "invalid_email" });
    }

    const emailHash = hashEmail(email, config.hashSecret);
    const now = Date.now();
    const before = getOtpRow(db, emailHash);
    const code = generateOtp();

    const reserved = reserveOtpSlot(db, emailHash, code, now + config.otpTtlMs, now, config.otpMinIntervalMs);
    if (!reserved) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    try {
      await sendOtpEmail(normalizeEmail(email), code, config.resendApiKey);
    } catch (err) {
      // Delivery failed — release the slot so a genuine retry isn't locked
      // out, and any code that was still valid before this attempt keeps
      // working (see restoreOtpRow).
      restoreOtpRow(db, emailHash, before);
      app.log.error(err);
      return reply.code(502).send({ error: "email_delivery_failed" });
    }

    return reply.send({ ok: true });
  });

  app.post("/auth/device", async (request, reply) => {
    const body = request.body as { deviceId?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";

    if (deviceId === "") {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const emailHash = hashDeviceId(deviceId, config.hashSecret);
    const now = Date.now();
    upsertUser(db, emailHash, now, true);
    const token = generateSessionToken();
    const expiresAt = now + config.sessionTtlMs;
    createSession(db, token, emailHash, expiresAt);

    return reply.send({ token, expiresAt });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const body = request.body as { email?: unknown; code?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const code = typeof body.code === "string" ? body.code : "";

    if (!isValidEmail(email) || code === "") {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const emailHash = hashEmail(email, config.hashSecret);
    const now = Date.now();
    const row = getOtpRow(db, emailHash);
    const stored = row ? { code: row.code, expiresAt: row.expires_at, attempts: row.attempts } : null;

    if (!isOtpValid(stored, code, now, config.otpMaxAttempts)) {
      if (row) incrementOtpAttempts(db, emailHash);
      return reply.code(401).send({ error: "invalid_code" });
    }

    const anonToken = bearerToken(request.headers.authorization);
    const anonEmailHash = resolveEmailHash(db, anonToken);

    deleteOtpRow(db, emailHash);
    upsertUser(db, emailHash, now);
    const token = generateSessionToken();
    const expiresAt = now + config.sessionTtlMs;
    createSession(db, token, emailHash, expiresAt);

    if (anonToken !== null && anonEmailHash !== null && anonEmailHash !== emailHash && isAnonymousUser(db, anonEmailHash)) {
      mergeAnonymousIdentity(db, anonEmailHash, emailHash, now);
      deleteSession(db, anonToken);
    }

    return reply.send({ token, expiresAt });
  });

  app.get("/auth/me", async (request: FastifyRequest, reply) => {
    const emailHash = resolveEmailHash(db, bearerToken(request.headers.authorization));
    if (emailHash === null) return reply.code(401).send({ error: "unauthenticated" });
    return reply.send({ ok: true });
  });

  app.post("/auth/logout", async (request: FastifyRequest, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (token !== null) deleteSession(db, token);
    return reply.send({ ok: true });
  });
}
