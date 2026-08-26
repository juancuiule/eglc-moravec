import { createHmac } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

/** Salted, deterministic User identifier — never the plaintext email. */
export function hashEmail(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}

/**
 * Same idea as hashEmail, for a client-generated anonymous device id
 * instead of an email — namespaced with a fixed prefix so a crafted
 * device id can never land on the same hash as a real email's.
 */
export function hashDeviceId(deviceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`device:${deviceId}`).digest("hex");
}

export type StoredOtp = {
  code: string;
  expiresAt: number;
  attempts: number;
};

export function isOtpValid(
  stored: StoredOtp | null,
  submittedCode: string,
  now: number,
  maxAttempts: number,
): boolean {
  if (stored === null) return false;
  if (stored.attempts >= maxAttempts) return false;
  if (now > stored.expiresAt) return false;
  return stored.code === submittedCode;
}
