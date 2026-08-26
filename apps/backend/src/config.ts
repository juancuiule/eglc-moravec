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
  /**
   * Pretty-print logs for a human reading a terminal — on only when NODE_ENV
   * is exactly "development" (set by the `dev` script). Explicit opt-in
   * rather than "everything except production", because every test file
   * builds its Config from a literal env object that never sets NODE_ENV —
   * an opt-out default would silently spin up pino-pretty's worker thread
   * in every test run.
   */
  prettyPrintLogs: boolean;
};

/** `.env` files (and docker-compose's env_file) turn a blank value into "", not unset — treat both as unset. */
function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.NODE_ENV === "production" && !nonEmpty(env.EMAIL_HASH_SECRET)) {
    throw new Error("EMAIL_HASH_SECRET must be set in production");
  }

  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/moravec.sqlite",
    emailHashSecret: nonEmpty(env.EMAIL_HASH_SECRET) ?? "dev-only-insecure-secret",
    resendApiKey: nonEmpty(env.RESEND_API_KEY) ?? null,
    otpTtlMs: 5 * 60 * 1000,
    otpMinIntervalMs: 30 * 1000,
    otpMaxAttempts: 5,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    corsOrigin: nonEmpty(env.CORS_ORIGIN) ?? true,
    prettyPrintLogs: env.NODE_ENV === "development",
  };
}
