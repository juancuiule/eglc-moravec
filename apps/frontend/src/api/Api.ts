import { errorFrom, request, requestJson, requestVoid } from "./utils";

export type OtpVerified = { token: string; expiresAt: number };

export type SyncTrial = {
  id: string;
  runType: "level" | "practice";
  levelNumber: number | null;
  categoryCodename: string;
  operands: number[];
  answer: number | null;
  timeTaken: number;
  playedAt: number; // epoch ms
  hintShown: boolean;
  runId: string;
};

export type SyncedTrial = {
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  runType: "level" | "practice";
};

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms
  completedAt: string; // ISO date
};

export const Api = {
  requestOtp(email: string): Promise<void> {
    return requestVoid("/auth/otp/request", {
      method: "POST",
      body: { email },
    });
  },

  verifyOtp(
    email: string,
    code: string,
    anonymousToken?: string,
  ): Promise<OtpVerified> {
    return requestJson<OtpVerified>("/auth/otp/verify", {
      method: "POST",
      body: { email, code },
      token: anonymousToken,
    });
  },

  registerDevice(deviceId: string): Promise<OtpVerified> {
    return requestJson<OtpVerified>("/auth/device", {
      method: "POST",
      body: { deviceId },
    });
  },

  async checkSession(token: string): Promise<boolean> {
    const res = await request("/auth/me", { method: "GET", token });
    return res.ok;
  },

  logout(token: string): Promise<void> {
    return requestVoid("/auth/logout", { method: "POST", token });
  },

  syncResults(token: string, trials: SyncTrial[]): Promise<void> {
    return requestVoid("/sync/results", {
      method: "POST",
      token,
      body: { trials },
    });
  },

  async fetchLevelStats(token: string) {
    const { levelStats } = await requestJson<{
      levelStats: Record<string, LevelStats>;
    }>("/sync/level-stats", {
      method: "GET",
      token,
    });
    return levelStats;
  },

  async fetchTrials(token: string): Promise<SyncedTrial[]> {
    const { trials } = await requestJson<{ trials: SyncedTrial[] }>(
      "/sync/trials",
      {
        method: "GET",
        token,
      },
    );
    return trials;
  },

  async fetchLevelNumbers(): Promise<number[]> {
    const { levels } = await requestJson<{ levels: number[] }>("/levels", {
      method: "GET",
    });
    return levels;
  },

  /** Null specifically means "no such level" (404) — any other failure still throws. */
  async fetchLevel(
    levelNumber: number,
  ): Promise<Record<string, number> | null> {
    const res = await request(`/levels/${levelNumber}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorFrom(res));
    const data = (await res.json()) as { mix: Record<string, number> };
    return data.mix;
  },
};
