import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { generateOtp, generateSessionToken } from "../auth/crypto.js";
import { sendOtpEmail } from "../auth/email.js";
import {
  hashDeviceId,
  hashEmail,
  isOtpValid,
  normalizeEmail,
} from "../auth/logic.js";
import {
  completeOtpVerification,
  createSession,
  deleteSession,
  getOtpRow,
  incrementOtpAttempts,
  reserveOtpSlot,
  restoreOtpRow,
  upsertUser,
} from "../auth/repo.js";
import {
  bearerToken,
  requireEmailHash,
  resolveEmailHash,
} from "../auth/session.js";
import type { Config } from "../config";
import { parseBody } from "../parser.js";

import * as z from "zod";

function rateLimited(reply: FastifyReply, max: number, retryAfterMs: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return reply
    .code(429)
    .headers({
      "retry-after": seconds,
      "x-ratelimit-limit": max,
      "x-ratelimit-remaining": 0,
      "x-ratelimit-reset": seconds,
    })
    .send({ error: "rate_limited" });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
  config: Config,
): void {
  let sendWindowStartedAt = 0;
  let sendAttempts = 0;

  app.post(
    "/auth/otp/request",
    {
      config: {
        rateLimit: {
          max: config.otpIpRateLimitMax,
          timeWindow: config.otpIpRateLimitWindowMs,
        },
      },
    },
    async (request, reply) => {
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
        return rateLimited(
          reply,
          1,
          (before?.requested_at ?? now) + config.otpMinIntervalMs - now,
        );
      }

      if (
        sendAttempts === 0 ||
        now - sendWindowStartedAt >= config.otpGlobalRateLimitWindowMs
      ) {
        sendWindowStartedAt = now;
        sendAttempts = 0;
      }
      if (sendAttempts >= config.otpGlobalRateLimitMax) {
        restoreOtpRow(db, emailHash, before, { code, requestedAt: now });
        return rateLimited(
          reply,
          config.otpGlobalRateLimitMax,
          config.otpGlobalRateLimitWindowMs - (now - sendWindowStartedAt),
        );
      }
      sendAttempts++;

      try {
        await sendOtpEmail(normalizeEmail(email), code, config.resendApiKey);
      } catch {
        restoreOtpRow(db, emailHash, before, { code, requestedAt: now });
        app.log.error("OTP email delivery failed");
        return reply.code(502).send({ error: "email_delivery_failed" });
      }

      return reply.send({ ok: true });
    },
  );

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

    const token = generateSessionToken();
    const expiresAt = now + config.sessionTtlMs;
    completeOtpVerification(db, {
      emailHash,
      anonymousEmailHash: anonEmailHash,
      token,
      expiresAt,
      createdAt: now,
    });

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
