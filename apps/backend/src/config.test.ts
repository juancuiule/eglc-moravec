import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("falls back to defaults when optional vars are unset", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.resendApiKey).toBeNull();
    expect(config.corsOrigin).toBe(true);
    expect(config.hashSecret).toBe("dev-only-insecure-secret");
  });

  it("treats a blank env value the same as unset — .env/env_file turn a blank into '', not undefined", () => {
    const config = loadConfig({
      HASH_SECRET: "",
      RESEND_API_KEY: "",
      CORS_ORIGIN: "",
    } as NodeJS.ProcessEnv);
    expect(config.resendApiKey).toBeNull();
    expect(config.corsOrigin).toBe(true);
    expect(config.hashSecret).toBe("dev-only-insecure-secret");
  });

  it("uses real values when provided", () => {
    const config = loadConfig({
      HASH_SECRET: "real-secret",
      RESEND_API_KEY: "re_123",
      CORS_ORIGIN: "https://moravec.app",
    } as NodeJS.ProcessEnv);
    expect(config.hashSecret).toBe("real-secret");
    expect(config.resendApiKey).toBe("re_123");
    expect(config.corsOrigin).toBe("https://moravec.app");
  });

  it("throws in production when HASH_SECRET is blank, not just unset", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        HASH_SECRET: "",
      } as NodeJS.ProcessEnv),
    ).toThrow("HASH_SECRET must be set in production");
  });

  it("does not throw in production when HASH_SECRET is a real value", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        HASH_SECRET: "real-secret",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("defaults to secure OTP limits with proxy trust disabled", () => {
    expect(loadConfig({})).toMatchObject({
      otpIpRateLimitMax: 10,
      otpIpRateLimitWindowMs: 600_000,
      otpGlobalRateLimitMax: 100,
      otpGlobalRateLimitWindowMs: 3_600_000,
      trustedProxyIp: null,
    });
  });

  it("accepts positive integer OTP overrides and an explicit proxy IP", () => {
    expect(
      loadConfig({
        OTP_IP_RATE_LIMIT_MAX: "2",
        OTP_IP_RATE_LIMIT_WINDOW_MS: "3000",
        OTP_GLOBAL_RATE_LIMIT_MAX: "4",
        OTP_GLOBAL_RATE_LIMIT_WINDOW_MS: "5000",
        TRUSTED_PROXY_IP: "172.30.60.2",
      }),
    ).toMatchObject({
      otpIpRateLimitMax: 2,
      otpIpRateLimitWindowMs: 3000,
      otpGlobalRateLimitMax: 4,
      otpGlobalRateLimitWindowMs: 5000,
      trustedProxyIp: "172.30.60.2",
    });
  });

  describe.each([
    "OTP_IP_RATE_LIMIT_MAX",
    "OTP_IP_RATE_LIMIT_WINDOW_MS",
    "OTP_GLOBAL_RATE_LIMIT_MAX",
    "OTP_GLOBAL_RATE_LIMIT_WINDOW_MS",
  ])("%s", (key) => {
    it.each([
      "",
      " ",
      "0",
      "-1",
      "1.5",
      "1.0000000000000001",
      "1e2",
      "0x10",
      "NaN",
      "Infinity",
      "100oops",
      "9007199254740992",
    ])("rejects invalid override %j", (value) => {
      expect(() => loadConfig({ [key]: value })).toThrow(key);
    });
  });

  it.each([
    "true",
    "1",
    "0.0.0.0/0",
    "172.30.60.0/24",
    "loopback",
    "172.30.60.2,172.30.60.3",
  ])("rejects broad or invalid proxy trust %j", (value) => {
    expect(() => loadConfig({ TRUSTED_PROXY_IP: value })).toThrow(
      "TRUSTED_PROXY_IP",
    );
  });

  describe("prettyPrintLogs", () => {
    it("is on only when NODE_ENV is exactly 'development'", () => {
      const config = loadConfig({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv);
      expect(config.prettyPrintLogs).toBe(true);
    });

    it("is off when NODE_ENV is unset — every test file's Config comes from a literal env object that never sets it, so an opt-out default would spin up pino-pretty's worker thread in every test run", () => {
      const config = loadConfig({} as NodeJS.ProcessEnv);
      expect(config.prettyPrintLogs).toBe(false);
    });

    it("is off in production", () => {
      const config = loadConfig({
        NODE_ENV: "production",
        HASH_SECRET: "real-secret",
      } as NodeJS.ProcessEnv);
      expect(config.prettyPrintLogs).toBe(false);
    });

    it("is off in test", () => {
      const config = loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
      expect(config.prettyPrintLogs).toBe(false);
    });
  });
});
