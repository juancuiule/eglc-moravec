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
