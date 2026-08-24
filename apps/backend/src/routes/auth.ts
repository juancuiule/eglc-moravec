import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "../config.js";
import {
  normalizeEmail,
  isValidEmail,
  hashEmail,
  hashDeviceId,
  canRequestNewOtp,
  isOtpValid,
} from "../auth/logic.js";
import { generateOtp, generateSessionToken } from "../auth/crypto.js";
import {
  getOtpRow,
  upsertOtpRow,
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

    const emailHash = hashEmail(email, config.emailHashSecret);
    const now = Date.now();
    const existing = getOtpRow(db, emailHash);

    if (!canRequestNewOtp(existing?.requested_at ?? null, now, config.otpMinIntervalMs)) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const code = generateOtp();
    try {
      await sendOtpEmail(normalizeEmail(email), code, config.resendApiKey);
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: "email_delivery_failed" });
    }

    // Only arm the rate limit once the code has actually been sent —
    // otherwise a delivery failure would lock the caller out for no reason.
    upsertOtpRow(db, emailHash, code, now + config.otpTtlMs, now);

    return reply.send({ ok: true });
  });

  // Unauthenticated, no OTP round-trip — mints a low-friction anonymous
  // identity so a player's trials always have somewhere to sync to, even
  // before they ever give an email (ADR-0009).
  app.post("/auth/device", async (request, reply) => {
    const body = request.body as { deviceId?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";

    if (deviceId === "") {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const emailHash = hashDeviceId(deviceId, config.emailHashSecret);
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

    const emailHash = hashEmail(email, config.emailHashSecret);
    const now = Date.now();
    const row = getOtpRow(db, emailHash);
    const stored = row ? { code: row.code, expiresAt: row.expires_at, attempts: row.attempts } : null;

    if (!isOtpValid(stored, code, now, config.otpMaxAttempts)) {
      if (row) incrementOtpAttempts(db, emailHash);
      return reply.code(401).send({ error: "invalid_code" });
    }

    // Resolved *before* minting the new session, from whatever token this
    // request happened to carry — only acted on below if it turns out to
    // genuinely be an anonymous identity's own token, never another real
    // account's (that would merge one player's data into a different one).
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
