import { describe, it, expect } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { insertTrialResults } from "../sync/repo.js";
import type { TrialResultInput } from "../sync/logic.js";

function setup(): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ EMAIL_HASH_SECRET: "test-secret" } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

function trial(overrides: Partial<TrialResultInput> = {}): TrialResultInput {
  return {
    levelNumber: 1,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    ...overrides,
  };
}

describe("GET /admin/stats", () => {
  it("aggregates across every user, by level and by category", async () => {
    const { db, app } = setup();

    // User A: level 1, correct-in-time (1000ms), then a wrong attempt
    insertTrialResults(db, "userA", [
      trial({ timeTaken: 1000 }),
      trial({ correct: false }),
    ]);
    // User B: level 1, correct-in-time (2000ms)
    insertTrialResults(db, "userB", [trial({ timeTaken: 2000 })]);
    // User B: level 2, category 1dx1d, correct but timed out — not correct-in-time
    insertTrialResults(db, "userB", [
      trial({ levelNumber: 2, categoryCodename: "1dx1d", timeExceeded: true, timeTaken: 5000 }),
    ]);

    const res = await app.inject({ method: "GET", url: "/admin/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const level1 = body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 1);
    expect(level1).toMatchObject({ attemptCount: 3, userCount: 2, effectiveness: 2 / 3, avgTimeMs: 1500 });

    const level2 = body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 2);
    expect(level2).toMatchObject({ attemptCount: 1, userCount: 1, effectiveness: 0, avgTimeMs: null });

    const addition = body.byCategory.find((r: { categoryCodename: string }) => r.categoryCodename === "1d+1d");
    expect(addition).toMatchObject({ attemptCount: 3, userCount: 2, effectiveness: 2 / 3, avgTimeMs: 1500 });

    const mult = body.byCategory.find((r: { categoryCodename: string }) => r.categoryCodename === "1dx1d");
    expect(mult).toMatchObject({ attemptCount: 1, userCount: 1, effectiveness: 0, avgTimeMs: null });
  });

  it("requires no authentication", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/admin/stats" });
    expect(res.statusCode).toBe(200);
  });

  it("returns empty arrays when there is no data", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/admin/stats" });
    expect(res.json()).toEqual({ byLevel: [], byCategory: [] });
  });
});
