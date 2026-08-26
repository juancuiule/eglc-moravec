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

/**
 * Atomically checks the rate limit *and* claims the slot in one write, so
 * two concurrent requests for the same email can't both read the same
 * "last requested" snapshot and both slip past the throttle (the previous
 * check-then-send-then-write shape had exactly that gap, with the email
 * send sitting in between). The WHERE clause is what makes this atomic:
 * SQLite skips the DO UPDATE (and reports zero changes) when it evaluates
 * to false, rather than applying it — so `false` from this function is a
 * genuine "someone already holds this slot", never a lost update.
 * Returns whether the slot was claimed.
 */
export function reserveOtpSlot(
  db: DatabaseSync,
  emailHash: string,
  code: string,
  expiresAt: number,
  requestedAt: number,
  minIntervalMs: number,
): boolean {
  const result = db
    .prepare(
      `INSERT INTO otp_codes (email_hash, code, expires_at, attempts, requested_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(email_hash) DO UPDATE SET
         code = excluded.code,
         expires_at = excluded.expires_at,
         attempts = 0,
         requested_at = excluded.requested_at
       WHERE otp_codes.requested_at <= ?`,
    )
    .run(emailHash, code, expiresAt, requestedAt, requestedAt - minIntervalMs);
  return result.changes !== 0;
}

/**
 * Undoes a reservation whose email delivery failed, so a real retry isn't
 * locked out by a slot nothing was ever sent for. `before` is whatever
 * reserveOtpSlot's caller read *before* reserving — restoring it exactly
 * (rather than just deleting the row) preserves a still-valid prior code
 * instead of invalidating it as a side effect of the failed attempt.
 */
export function restoreOtpRow(db: DatabaseSync, emailHash: string, before: OtpRow | undefined): void {
  if (before === undefined) {
    db.prepare("DELETE FROM otp_codes WHERE email_hash = ?").run(emailHash);
    return;
  }
  db.prepare(
    `UPDATE otp_codes SET code = ?, expires_at = ?, attempts = ?, requested_at = ? WHERE email_hash = ?`,
  ).run(before.code, before.expires_at, before.attempts, before.requested_at, emailHash);
}

export function incrementOtpAttempts(db: DatabaseSync, emailHash: string): void {
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE email_hash = ?").run(emailHash);
}

export function deleteOtpRow(db: DatabaseSync, emailHash: string): void {
  db.prepare("DELETE FROM otp_codes WHERE email_hash = ?").run(emailHash);
}

export function upsertUser(
  db: DatabaseSync,
  emailHash: string,
  createdAt: number,
  isAnonymous: boolean = false,
): void {
  db.prepare(
    `INSERT INTO users (email_hash, created_at, is_anonymous) VALUES (?, ?, ?)
     ON CONFLICT(email_hash) DO NOTHING`,
  ).run(emailHash, createdAt, isAnonymous ? 1 : 0);
}

/** False for an unknown emailHash too — only a confirmed anonymous user merges away on login. */
export function isAnonymousUser(db: DatabaseSync, emailHash: string): boolean {
  const row = db.prepare("SELECT is_anonymous FROM users WHERE email_hash = ?").get(emailHash) as
    | { is_anonymous: number }
    | undefined;
  return row?.is_anonymous === 1;
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
