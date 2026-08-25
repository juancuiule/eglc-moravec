import { API_URL } from "../env";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OtpVerified = { token: string; expiresAt: number };

export type Keystroke = { key: string; t: number };

/**
 * Wire shape of one Trial pushed to /sync/trial-results/push. `id` is the
 * client-generated dedup key; `clientCorrect`/`clientTimeExceeded` are the
 * player's own immutable claim; `correct`/`timeExceeded` are the client's
 * optimistic guess going out, and the backend's independently-recomputed,
 * authoritative value coming back in the response.
 */
export type TrialResultPush = {
  id: string;
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  clientCorrect: boolean;
  clientTimeExceeded: boolean;
  timeTaken: number;
  playedAt: number; // epoch ms
  keystrokes: Keystroke[];
  operands: number[];
  answer: number | null;
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  levelRunId: string;
};

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms
  completedAt: string; // ISO date
};

export type PersistedLevelStats = Record<string, LevelStats>;

export type PerformanceSummary = {
  attemptCount: number;
  userCount: number;
  effectiveness: number; // 0-1
  avgTimeMs: number | null;
};

export type LevelPerformance = PerformanceSummary & { levelNumber: number };
export type CategoryPerformance = PerformanceSummary & { categoryCodename: string };

export type AdminStats = {
  byLevel: LevelPerformance[];
  byCategory: CategoryPerformance[];
};

// ─── Request helpers ───────────────────────────────────────────────────────────

type RequestOptions = {
  method: "GET" | "POST";
  /** Attached as an `Authorization: Bearer` header when present. */
  token?: string;
  /** JSON-stringified as the body; also sets Content-Type. */
  body?: unknown;
};

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" ? body.error : null) ?? "request_failed";
}

/** Every backend call goes through this — the one place headers get built. */
async function request(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  return fetch(`${API_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Like `request`, but throws on a non-ok response and parses the JSON body. */
async function requestJson<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) throw new Error(await errorFrom(res));
  return (await res.json()) as T;
}

/** Like `request`, but throws on a non-ok response and discards the body. */
async function requestVoid(path: string, options: RequestOptions): Promise<void> {
  const res = await request(path, options);
  if (!res.ok) throw new Error(await errorFrom(res));
}

// ─── Api ───────────────────────────────────────────────────────────────────────

/**
 * The one place every call to the backend is defined. Each function is a
 * plain async function — callable directly (server components, imperative
 * call sites) or as a TanStack Query `queryFn`/`mutationFn`. Every function
 * throws on a non-ok response (the standard TanStack Query error contract),
 * except `checkSession`, whose whole contract is reporting validity as a
 * boolean, not an error; a best-effort call site decides for itself whether
 * to swallow a thrown rejection.
 */
export const Api = {
  requestOtp(email: string): Promise<void> {
    return requestVoid("/auth/otp/request", { method: "POST", body: { email } });
  },

  /**
   * `anonymousToken`, when the caller currently holds one, is sent as this
   * request's own Bearer token — the backend resolves it and, if it really
   * is an anonymous (device-id) identity, merges its trials/level_stats
   * into the newly-verified email account before returning.
   */
  verifyOtp(email: string, code: string, anonymousToken?: string): Promise<OtpVerified> {
    return requestJson<OtpVerified>("/auth/otp/verify", {
      method: "POST",
      body: { email, code },
      token: anonymousToken,
    });
  },

  /** Mints a low-friction anonymous session for this device — no email, no OTP round-trip. */
  registerDevice(deviceId: string): Promise<OtpVerified> {
    return requestJson<OtpVerified>("/auth/device", { method: "POST", body: { deviceId } });
  },

  async checkSession(token: string): Promise<boolean> {
    const res = await request("/auth/me", { method: "GET", token });
    return res.ok;
  },

  logout(token: string): Promise<void> {
    return requestVoid("/auth/logout", { method: "POST", token });
  },

  /** Returns the backend's authoritative version of every pushed Trial (see TrialResultPush). */
  async pushTrialResults(token: string, trials: TrialResultPush[]): Promise<TrialResultPush[]> {
    const data = await requestJson<{ trials: TrialResultPush[] }>("/sync/trial-results/push", {
      method: "POST",
      token,
      body: { trials },
    });
    return data.trials;
  },

  async pullLevelStats(token: string): Promise<PersistedLevelStats> {
    const data = await requestJson<{ levelStats: PersistedLevelStats }>("/sync/level-stats", {
      method: "GET",
      token,
    });
    return data.levelStats;
  },

  fetchAdminStats(): Promise<AdminStats> {
    return requestJson<AdminStats>("/admin/stats", { method: "GET" });
  },

  async fetchLevelNumbers(): Promise<number[]> {
    const data = await requestJson<{ levels: number[] }>("/levels", { method: "GET" });
    return data.levels;
  },

  /** Null specifically means "no such level" (404) — any other failure still throws. */
  async fetchLevel(levelNumber: number): Promise<Record<string, number> | null> {
    const res = await request(`/levels/${levelNumber}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorFrom(res));
    const data = (await res.json()) as { mix: Record<string, number> };
    return data.mix;
  },
};
