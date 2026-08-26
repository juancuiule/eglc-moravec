import { describe, it, expect } from "vitest";
import { openDb } from "./db.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const testConfig = loadConfig({ EMAIL_HASH_SECRET: "test-secret" } as NodeJS.ProcessEnv);

describe("GET /health", () => {
  it("returns 200 with db: true when the database is reachable", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: true });
  });

  it("returns 503 with db: false once the database is closed", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, testConfig);
    db.close();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "degraded", db: false });
  });
});
