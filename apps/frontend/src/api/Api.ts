import {
  EvaluatedTrialResult,
  TrialResultInput,
  type LevelStatsWire,
  type SyncedTrial,
} from "engine";
import { errorFrom, request, requestJson, requestVoid } from "./utils";

export type OtpVerified = { token: string; expiresAt: number };

// The /sync/level-stats wire shape lives in engine (levelStatsToWire is its
// only serializer, on both sides); this alias keeps the shorter local name.
export type LevelStats = LevelStatsWire;

// What GET /sync/trials returns — the engine zod schema the rows are
// validated against on merge is the type source (SyncedTrialSchema).
export type { SyncedTrial };

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

  // Returns the HTTP status — callers distinguish "token is dead" (401,
  // clear the cookie) from "backend unreachable" (5xx, fail open).
  async sessionStatus(token: string): Promise<number> {
    const res = await request("/auth/me", { method: "GET", token });
    return res.status;
  },

  logout(token: string): Promise<void> {
    return requestVoid("/auth/logout", { method: "POST", token });
  },

  syncResults(token: string, trials: TrialResultInput[]) {
    return requestJson<{ trials: EvaluatedTrialResult[] }>("/sync/results", {
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
