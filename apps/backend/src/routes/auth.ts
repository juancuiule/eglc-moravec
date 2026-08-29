import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { generateOtp, generateSessionToken } from "../auth/crypto";
import { sendOtpEmail } from "../auth/email";
import {
  hashDeviceId,
  hashEmail,
  isOtpValid,
  normalizeEmail,
} from "../auth/logic";
import {
  createSession,
  deleteOtpRow,
  deleteSession,
  getOtpRow,
  incrementOtpAttempts,
  isAnonymousUser,
  reserveOtpSlot,
  restoreOtpRow,
  upsertUser,
} from "../auth/repo";
import {
  bearerToken,
  requireEmailHash,
  resolveEmailHash,
} from "../auth/session";
import type { Config } from "../config";
import { parseBody } from "../parser";
import { mergeAnonymousIdentity } from "../sync/repo";

import * as z from "zod";

export function registerAuthRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
  config: Config,
): void {
  app.post("/auth/otp/request", async (request, reply) => {
    const { email } = parseBody(
      request.body,
      z.object({
        email: z.email(),
      }),
    );

    const emailHash = hashEmail(email, config.hashSecret);
    const now = Date.now();
    const before = getOtpRow(db, emailHash);
    const code = generateOtp();

    const reserved = reserveOtpSlot(
      db,
      emailHash,
      code,
      now + config.otpTtlMs,
      now,
      config.otpMinIntervalMs,
    );
    if (!reserved) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    try {
      await sendOtpEmail(normalizeEmail(email), code, config.resendApiKey);
    } catch (err) {
      restoreOtpRow(db, emailHash, before);
      app.log.error(err);
      return reply.code(502).send({ error: "email_delivery_failed" });
    }

    return reply.send({ ok: true });
  });

  app.post("/auth/device", async (request, reply) => {
    const { deviceId } = parseBody(
      request.body,
      z.object({
        deviceId: z.uuidv4(),
      }),
    );

    const emailHash = hashDeviceId(deviceId, config.hashSecret);
    const now = Date.now();
    upsertUser(db, emailHash, now, true);
    const token = generateSessionToken();
    const expiresAt = now + config.sessionTtlMs;
    createSession(db, token, emailHash, expiresAt);

    return reply.send({ token, expiresAt });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const { email, code } = parseBody(
      request.body,
      z.object({
        email: z.email(),
        code: z.string().length(6).regex(/^\d+$/),
      }),
    );

    const emailHash = hashEmail(email, config.hashSecret);
    const now = Date.now();
    const row = getOtpRow(db, emailHash);
    const stored = row
      ? { code: row.code, expiresAt: row.expires_at, attempts: row.attempts }
      : null;

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

    if (
      anonToken !== null &&
      anonEmailHash !== null &&
      anonEmailHash !== emailHash &&
      isAnonymousUser(db, anonEmailHash)
    ) {
      mergeAnonymousIdentity(db, anonEmailHash, emailHash, now);
      deleteSession(db, anonToken);
    }

    return reply.send({ token, expiresAt });
  });

  app.get("/auth/me", async (request, reply) => {
    const emailHash = requireEmailHash(db, request, reply);
    if (emailHash === null) return;
    return reply.send({ ok: true });
  });

  app.post("/auth/logout", async (request: FastifyRequest, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (token !== null) deleteSession(db, token);
    return reply.send({ ok: true });
  });
}
