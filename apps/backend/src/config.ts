import { isIP } from "node:net";

export type Config = {
  port: number;
  dbPath: string;
  hashSecret: string;
  resendApiKey: string | null;
  otpTtlMs: number;
  otpMinIntervalMs: number;
  otpMaxAttempts: number;
  otpIpRateLimitMax: number;
  otpIpRateLimitWindowMs: number;
  otpGlobalRateLimitMax: number;
  otpGlobalRateLimitWindowMs: number;
  trustedProxyIp: string | null;
  sessionTtlMs: number;
  corsOrigin: string | true;
  prettyPrintLogs: boolean;
};

/** `.env` files (and docker-compose's env_file) turn a blank value into "", not unset — treat both as unset. */
function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${key} must be a positive safe integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive safe integer`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.NODE_ENV === "production" && !nonEmpty(env.HASH_SECRET)) {
    throw new Error("HASH_SECRET must be set in production");
  }

  const trustedProxyIp = nonEmpty(env.TRUSTED_PROXY_IP) ?? null;
  if (trustedProxyIp !== null && !isIP(trustedProxyIp)) {
    throw new Error("TRUSTED_PROXY_IP must be a single nginx IP address");
  }

  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/moravec.sqlite",
    hashSecret: nonEmpty(env.HASH_SECRET) ?? "dev-only-insecure-secret",
    resendApiKey: nonEmpty(env.RESEND_API_KEY) ?? null,
    otpTtlMs: 5 * 60 * 1000,
    otpMinIntervalMs: 30 * 1000,
    otpMaxAttempts: 5,
    otpIpRateLimitMax: positiveInteger(env, "OTP_IP_RATE_LIMIT_MAX", 10),
    otpIpRateLimitWindowMs: positiveInteger(
      env,
      "OTP_IP_RATE_LIMIT_WINDOW_MS",
      600_000,
    ),
    otpGlobalRateLimitMax: positiveInteger(
      env,
      "OTP_GLOBAL_RATE_LIMIT_MAX",
      100,
    ),
    otpGlobalRateLimitWindowMs: positiveInteger(
      env,
      "OTP_GLOBAL_RATE_LIMIT_WINDOW_MS",
      3_600_000,
    ),
    trustedProxyIp,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    corsOrigin: nonEmpty(env.CORS_ORIGIN) ?? true,
    prettyPrintLogs: env.NODE_ENV === "development",
  };
}
