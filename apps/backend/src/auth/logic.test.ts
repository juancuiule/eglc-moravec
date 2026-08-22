import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmail, hashEmail, canRequestNewOtp, isOtpValid } from "./logic.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.com  ")).toBe("foo@bar.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible email", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("nope")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("hashEmail", () => {
  it("is deterministic for the same email + secret", () => {
    expect(hashEmail("a@b.com", "secret")).toBe(hashEmail("a@b.com", "secret"));
  });

  it("normalizes before hashing, so casing/whitespace don't change the result", () => {
    expect(hashEmail("A@B.com", "secret")).toBe(hashEmail(" a@b.com ", "secret"));
  });

  it("differs for a different secret", () => {
    expect(hashEmail("a@b.com", "secret1")).not.toBe(hashEmail("a@b.com", "secret2"));
  });
});

describe("canRequestNewOtp", () => {
  it("allows a first request", () => {
    expect(canRequestNewOtp(null, 1000, 30_000)).toBe(true);
  });

  it("blocks a request within the interval", () => {
    expect(canRequestNewOtp(1000, 1000 + 10_000, 30_000)).toBe(false);
  });

  it("allows a request once the interval has passed", () => {
    expect(canRequestNewOtp(1000, 1000 + 30_000, 30_000)).toBe(true);
  });
});

describe("isOtpValid", () => {
  const stored = { code: "123456", expiresAt: 100_000, attempts: 0 };

  it("accepts a correct, unexpired code", () => {
    expect(isOtpValid(stored, "123456", 50_000, 5)).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(isOtpValid(stored, "000000", 50_000, 5)).toBe(false);
  });

  it("rejects an expired code", () => {
    expect(isOtpValid(stored, "123456", 200_000, 5)).toBe(false);
  });

  it("rejects when there's no stored code", () => {
    expect(isOtpValid(null, "123456", 50_000, 5)).toBe(false);
  });

  it("rejects once attempts reach the max", () => {
    expect(isOtpValid({ ...stored, attempts: 5 }, "123456", 50_000, 5)).toBe(false);
  });
});
