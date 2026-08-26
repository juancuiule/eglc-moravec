import { describe, it, expect } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { insertTrialResults } from "../sync/repo.js";
import type { EvaluatedTrialResult } from "../sync/logic.js";

function setup(): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ EMAIL_HASH_SECRET: "test-secret" } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

function trial(overrides: Partial<EvaluatedTrialResult> = {}): EvaluatedTrialResult {
  return {
    levelNumber: 1,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    clientCorrect: true,
    clientTimeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId: "run-1",
    runType: "level",
    ...overrides,
  };
}

describe("GET /admin/stats", () => {
  it("aggregates across every user, by level and by category", async () => {
    const { db, app } = setup();

    // User A: level 1, correct (1000ms), then a wrong attempt
    insertTrialResults(db, "userA", [
      trial({ timeTaken: 1000 }),
      trial({ correct: false }),
    ]);
    // User B: level 1, correct (2000ms)
    insertTrialResults(db, "userB", [trial({ timeTaken: 2000 })]);
    // User B: level 2, category 1dx1d, correct but timed out — still counts as correct
    insertTrialResults(db, "userB", [
      trial({ levelNumber: 2, categoryCodename: "1dx1d", timeExceeded: true, timeTaken: 5000 }),
    ]);

    const res = await app.inject({ method: "GET", url: "/admin/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const level1 = body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 1);
    expect(level1).toMatchObject({ attemptCount: 3, userCount: 2, effectiveness: 2 / 3, avgTimeMs: 1500 });

    const level2 = body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 2);
    expect(level2).toMatchObject({ attemptCount: 1, userCount: 1, effectiveness: 1, avgTimeMs: 5000 });

    const addition = body.byCategory.find((r: { categoryCodename: string }) => r.categoryCodename === "1d+1d");
    expect(addition).toMatchObject({ attemptCount: 3, userCount: 2, effectiveness: 2 / 3, avgTimeMs: 1500 });

    const mult = body.byCategory.find((r: { categoryCodename: string }) => r.categoryCodename === "1dx1d");
    expect(mult).toMatchObject({ attemptCount: 1, userCount: 1, effectiveness: 1, avgTimeMs: 5000 });
  });

  it("excludes Practice trials from both aggregates", async () => {
    const { db, app } = setup();

    insertTrialResults(db, "userA", [trial({ timeTaken: 1000 })]); // Level
    insertTrialResults(db, "userA", [
      trial({ runType: "practice", levelNumber: null, categoryCodename: "1d+1d", timeTaken: 9999 }),
    ]);

    const res = await app.inject({ method: "GET", url: "/admin/stats" });
    const body = res.json();

    const level1 = body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 1);
    expect(level1.attemptCount).toBe(1); // the Practice trial doesn't inflate this

    const addition = body.byCategory.find(
      (r: { categoryCodename: string }) => r.categoryCodename === "1d+1d",
    );
    expect(addition.attemptCount).toBe(1);
    expect(addition.avgTimeMs).toBe(1000); // Practice's 9999ms doesn't skew this either

    // No bogus "level 0" bucket from the Practice trial's sentinel level_number.
    expect(body.byLevel.find((r: { levelNumber: number }) => r.levelNumber === 0)).toBeUndefined();
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
