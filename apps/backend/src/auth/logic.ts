import { createHmac } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function hashEmail(email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`email:${normalizeEmail(email)}`)
    .digest("hex");
}

export function hashDeviceId(deviceId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`device:${deviceId}`)
    .digest("hex");
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
  return (
    stored !== null &&
    stored.attempts < maxAttempts &&
    now <= stored.expiresAt &&
    stored.code === submittedCode
  );
}
