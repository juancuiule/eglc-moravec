import { describe, it, expect } from "vitest";
import { openDb } from "../db.js";
import { createSession } from "./repo.js";
import { bearerToken, resolveEmailHash } from "./session.js";

describe("bearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null when the header is missing", () => {
    expect(bearerToken(undefined)).toBeNull();
  });

  it("returns null for a header that isn't a Bearer scheme", () => {
    expect(bearerToken("Basic abc123")).toBeNull();
  });
});

describe("resolveEmailHash", () => {
  it("returns null when the token is null", () => {
    const db = openDb(":memory:");
    expect(resolveEmailHash(db, null)).toBeNull();
  });

  it("returns null for an unknown token", () => {
    const db = openDb(":memory:");
    expect(resolveEmailHash(db, "no-such-token")).toBeNull();
  });

  it("returns the session's email hash for a valid, unexpired token", () => {
    const db = openDb(":memory:");
    createSession(db, "tok-1", "hash-1", Date.now() + 60_000);
    expect(resolveEmailHash(db, "tok-1")).toBe("hash-1");
  });

  it("returns null for an expired token", () => {
    const db = openDb(":memory:");
    createSession(db, "tok-1", "hash-1", Date.now() - 1);
    expect(resolveEmailHash(db, "tok-1")).toBeNull();
  });
});
