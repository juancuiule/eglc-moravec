import { EvaluatedTrialResult, TrialResultInput } from "engine";
import { errorFrom, request, requestJson, requestVoid } from "./utils";

export type OtpVerified = { token: string; expiresAt: number };

// Wire shape only: the backend serializes completedAt to an ISO string
// (see routes/sync.ts) rather than the epoch-ms number engine's own
// LevelStats uses internally.
export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms
  completedAt: string; // ISO date
};

// What GET /sync/trials actually returns — a flattened PersistedTrial.
// Not EvaluatedTrialResult: that type belongs to the sync push/validation
// contract, and the wire restores levelNumber=null for Practice rows.
export type SyncedTrial = {
  id: string;
  categoryCodename: string;
  operands: number[];
  answer: number | null; // null = timed out
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number; // ms
  playedAt: number; // epoch ms
  hintShown: boolean;
  runType: "level" | "practice";
  runId: string;
  levelNumber: number | null;
};

/** One row of GET /sync/activity: a local calendar day plus its trial count. */

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
