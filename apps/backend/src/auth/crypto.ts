import { randomInt, randomBytes } from "node:crypto";

// The only impure corner of the auth domain — isolated here so everything
// that decides *what to do* with a code/token (logic.ts) stays pure.

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
