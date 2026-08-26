import { describe, it, expect } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

function setup(): { db: DatabaseSync; app: FastifyInstance } {
  const db = openDb(":memory:");
  const config = loadConfig({ EMAIL_HASH_SECRET: "test-secret" } as NodeJS.ProcessEnv);
  const app = buildApp(db, config);
  return { db, app };
}

describe("GET /levels", () => {
  it("returns every level number, unauthenticated", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/levels" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.levels).toHaveLength(150);
    expect(body.levels[0]).toBe(1);
  });
});

describe("GET /levels/:levelNumber", () => {
  it("returns a known level's mix, unauthenticated", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/levels/1" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ levelNumber: 1, mix: { "1d+1d": 50, "1dx1d": 50 } });
  });

  it("404s for an unknown level number", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/levels/99999" });
    expect(res.statusCode).toBe(404);
  });

  it("400s for a non-numeric level number", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/levels/not-a-number" });
    expect(res.statusCode).toBe(400);
  });
});
