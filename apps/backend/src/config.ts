export type Config = {
  port: number;
  dbPath: string;
  emailHashSecret: string;
  resendApiKey: string | null;
  otpTtlMs: number;
  otpMinIntervalMs: number;
  otpMaxAttempts: number;
  sessionTtlMs: number;
  corsOrigin: string | true;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.NODE_ENV === "production" && !env.EMAIL_HASH_SECRET) {
    throw new Error("EMAIL_HASH_SECRET must be set in production");
  }

  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/moravec.sqlite",
    emailHashSecret: env.EMAIL_HASH_SECRET ?? "dev-only-insecure-secret",
    resendApiKey: env.RESEND_API_KEY ?? null,
    otpTtlMs: 5 * 60 * 1000,
    otpMinIntervalMs: 30 * 1000,
    otpMaxAttempts: 5,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    corsOrigin: env.CORS_ORIGIN ?? true,
  };
}
