import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getSession } from "./repo.js";

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export function resolveEmailHash(
  db: DatabaseSync,
  token: string | null,
): string | null {
  if (token === null) return null;
  const session = getSession(db, token);
  if (!session || session.expires_at < Date.now()) return null;
  return session.email_hash;
}

export function requireEmailHash(
  db: DatabaseSync,
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const emailHash = resolveEmailHash(
    db,
    bearerToken(request.headers.authorization),
  );
  if (emailHash === null) {
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  return emailHash;
}
