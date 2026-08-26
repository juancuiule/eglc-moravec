import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("falls back to defaults when optional vars are unset", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.resendApiKey).toBeNull();
    expect(config.corsOrigin).toBe(true);
    expect(config.emailHashSecret).toBe("dev-only-insecure-secret");
  });

  it("treats a blank env value the same as unset — .env/env_file turn a blank into '', not undefined", () => {
    const config = loadConfig({
      EMAIL_HASH_SECRET: "",
      RESEND_API_KEY: "",
      CORS_ORIGIN: "",
    } as NodeJS.ProcessEnv);
    expect(config.resendApiKey).toBeNull();
    expect(config.corsOrigin).toBe(true);
    expect(config.emailHashSecret).toBe("dev-only-insecure-secret");
  });

  it("uses real values when provided", () => {
    const config = loadConfig({
      EMAIL_HASH_SECRET: "real-secret",
      RESEND_API_KEY: "re_123",
      CORS_ORIGIN: "https://moravec.app",
    } as NodeJS.ProcessEnv);
    expect(config.emailHashSecret).toBe("real-secret");
    expect(config.resendApiKey).toBe("re_123");
    expect(config.corsOrigin).toBe("https://moravec.app");
  });

  it("throws in production when EMAIL_HASH_SECRET is blank, not just unset", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", EMAIL_HASH_SECRET: "" } as NodeJS.ProcessEnv),
    ).toThrow("EMAIL_HASH_SECRET must be set in production");
  });

  it("does not throw in production when EMAIL_HASH_SECRET is a real value", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", EMAIL_HASH_SECRET: "real-secret" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
