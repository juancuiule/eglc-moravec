import type { DatabaseSync } from "node:sqlite";

export type OtpRow = {
  email_hash: string;
  code: string;
  expires_at: number;
  attempts: number;
  requested_at: number;
};

export function getOtpRow(db: DatabaseSync, emailHash: string): OtpRow | undefined {
  return db.prepare("SELECT * FROM otp_codes WHERE email_hash = ?").get(emailHash) as
    | OtpRow
    | undefined;
}

export function upsertOtpRow(
  db: DatabaseSync,
  emailHash: string,
  code: string,
  expiresAt: number,
  requestedAt: number,
): void {
  db.prepare(
    `INSERT INTO otp_codes (email_hash, code, expires_at, attempts, requested_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email_hash) DO UPDATE SET
       code = excluded.code,
       expires_at = excluded.expires_at,
       attempts = 0,
       requested_at = excluded.requested_at`,
  ).run(emailHash, code, expiresAt, requestedAt);
}

export function incrementOtpAttempts(db: DatabaseSync, emailHash: string): void {
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE email_hash = ?").run(emailHash);
}

export function deleteOtpRow(db: DatabaseSync, emailHash: string): void {
  db.prepare("DELETE FROM otp_codes WHERE email_hash = ?").run(emailHash);
}

export function upsertUser(db: DatabaseSync, emailHash: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO users (email_hash, created_at) VALUES (?, ?)
     ON CONFLICT(email_hash) DO NOTHING`,
  ).run(emailHash, createdAt);
}

export type SessionRow = { token: string; email_hash: string; expires_at: number };

export function createSession(
  db: DatabaseSync,
  token: string,
  emailHash: string,
  expiresAt: number,
): void {
  db.prepare("INSERT INTO sessions (token, email_hash, expires_at) VALUES (?, ?, ?)").run(
    token,
    emailHash,
    expiresAt,
  );
}

export function getSession(db: DatabaseSync, token: string): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
    | SessionRow
    | undefined;
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
