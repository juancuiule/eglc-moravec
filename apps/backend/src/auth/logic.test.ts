import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  isValidEmail,
  hashEmail,
  hashDeviceId,
  isOtpValid,
} from "./logic.js";

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
    expect(hashEmail("A@B.com", "secret")).toBe(
      hashEmail(" a@b.com ", "secret"),
    );
  });

  it("differs for a different secret", () => {
    expect(hashEmail("a@b.com", "secret1")).not.toBe(
      hashEmail("a@b.com", "secret2"),
    );
  });
});

describe("hashDeviceId", () => {
  it("is deterministic for the same device id + secret", () => {
    expect(hashDeviceId("device-abc", "secret")).toBe(
      hashDeviceId("device-abc", "secret"),
    );
  });

  it("differs for a different secret", () => {
    expect(hashDeviceId("device-abc", "secret1")).not.toBe(
      hashDeviceId("device-abc", "secret2"),
    );
  });

  it("never collides with hashEmail for the same underlying string and secret", () => {
    expect(hashDeviceId("a@b.com", "secret")).not.toBe(
      hashEmail("a@b.com", "secret"),
    );
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
    expect(isOtpValid({ ...stored, attempts: 5 }, "123456", 50_000, 5)).toBe(
      false,
    );
  });
});
