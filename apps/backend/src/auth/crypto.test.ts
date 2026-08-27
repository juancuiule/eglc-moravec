import { describe, it, expect } from "vitest";
import { generateOtp, generateSessionToken } from "./crypto.js";

describe("generateOtp", () => {
  it("is always a zero-padded 6-digit string", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("produces varied codes, not a fixed value", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateSessionToken", () => {
  it("is a 64-character hex string (32 random bytes)", () => {
    expect(generateSessionToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is not reused across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });
});
