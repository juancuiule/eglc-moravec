import { API_URL } from "../env";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OtpVerified = { token: string; expiresAt: number };

export type Keystroke = { key: string; t: number };

/** Wire shape of one finished Trial pushed to /sync/results. */
export type SyncTrial = {
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: number; // epoch ms
  keystrokes: Keystroke[];
  operands: number[];
  answer: number | null;
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" ? body.error : null) ?? "request_failed";
}

function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// ─── Api ───────────────────────────────────────────────────────────────────────

/**
 * The one place every call to the backend is defined. Each function is a
 * plain async function — callable directly (server components, imperative
 * call sites) or as a TanStack Query `queryFn`/`mutationFn`. Every function
 * throws on a non-ok response (the standard TanStack Query error contract);
 * a best-effort call site decides for itself whether to swallow that.
 */
export const Api = {
  async requestOtp(email: string): Promise<void> {
    const res = await fetch(`${API_URL}/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await errorFrom(res));
  },

  async verifyOtp(email: string, code: string): Promise<OtpVerified> {
    const res = await fetch(`${API_URL}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) throw new Error(await errorFrom(res));
    return (await res.json()) as OtpVerified;
  },

  async checkSession(token: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeader(token) });
    return res.ok;
  },

  async logout(token: string): Promise<void> {
    const res = await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: authHeader(token) });
    if (!res.ok) throw new Error(await errorFrom(res));
  },

  async syncResults(token: string, trials: SyncTrial[]): Promise<void> {
    const res = await fetch(`${API_URL}/sync/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify({ trials }),
    });
    if (!res.ok) throw new Error(await errorFrom(res));
  },

  async pullLevelStats(token: string): Promise<PersistedLevelStats> {
    const res = await fetch(`${API_URL}/sync/level-stats`, { headers: authHeader(token) });
    if (!res.ok) throw new Error(await errorFrom(res));
    const data = await res.json();
    return data.levelStats as PersistedLevelStats;
  },

  async fetchAdminStats(): Promise<AdminStats> {
    const res = await fetch(`${API_URL}/admin/stats`);
    if (!res.ok) throw new Error(await errorFrom(res));
    return (await res.json()) as AdminStats;
  },
};
