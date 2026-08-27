import { describe, it, expect } from "vitest";
import { openDb } from "../db.js";
import {
  getOtpRow,
  reserveOtpSlot,
  restoreOtpRow,
  incrementOtpAttempts,
  deleteOtpRow,
  upsertUser,
  isAnonymousUser,
  createSession,
  getSession,
  deleteSession,
} from "./repo.js";

const MIN_INTERVAL_MS = 60_000;

describe("getOtpRow / reserveOtpSlot", () => {
  it("returns undefined when no OTP has been requested", () => {
    const db = openDb(":memory:");
    expect(getOtpRow(db, "hash-1")).toBeUndefined();
  });

  it("claims the slot and stores the row on first request", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    const claimed = reserveOtpSlot(db, "hash-1", "123456", now + 300_000, now, MIN_INTERVAL_MS);

    expect(claimed).toBe(true);
    expect(getOtpRow(db, "hash-1")).toEqual({
      email_hash: "hash-1",
      code: "123456",
      expires_at: now + 300_000,
      attempts: 0,
      requested_at: now,
    });
  });

  it("refuses a second reservation within the rate-limit window", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    reserveOtpSlot(db, "hash-1", "123456", now + 300_000, now, MIN_INTERVAL_MS);

    const claimed = reserveOtpSlot(
      db,
      "hash-1",
      "999999",
      now + 400_000,
      now + MIN_INTERVAL_MS - 1,
      MIN_INTERVAL_MS,
    );

    expect(claimed).toBe(false);
    // The row is untouched — a lost update would show the second code here.
    expect(getOtpRow(db, "hash-1")?.code).toBe("123456");
  });

  it("allows a new reservation once the rate-limit window has passed", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    reserveOtpSlot(db, "hash-1", "123456", now + 300_000, now, MIN_INTERVAL_MS);

    const claimed = reserveOtpSlot(
      db,
      "hash-1",
      "999999",
      now + 400_000,
      now + MIN_INTERVAL_MS,
      MIN_INTERVAL_MS,
    );

    expect(claimed).toBe(true);
    const row = getOtpRow(db, "hash-1");
    expect(row?.code).toBe("999999");
    expect(row?.attempts).toBe(0); // reset on a fresh reservation
  });

  it("resets attempts back to 0 on a fresh reservation, even if the previous code had failed attempts", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    reserveOtpSlot(db, "hash-1", "123456", now + 300_000, now, MIN_INTERVAL_MS);
    incrementOtpAttempts(db, "hash-1");
    incrementOtpAttempts(db, "hash-1");

    reserveOtpSlot(db, "hash-1", "999999", now + 400_000, now + MIN_INTERVAL_MS, MIN_INTERVAL_MS);

    expect(getOtpRow(db, "hash-1")?.attempts).toBe(0);
  });

  it("tracks separate emails independently", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    reserveOtpSlot(db, "hash-1", "111111", now + 300_000, now, MIN_INTERVAL_MS);
    reserveOtpSlot(db, "hash-2", "222222", now + 300_000, now, MIN_INTERVAL_MS);

    expect(getOtpRow(db, "hash-1")?.code).toBe("111111");
    expect(getOtpRow(db, "hash-2")?.code).toBe("222222");
  });
});

describe("restoreOtpRow", () => {
  it("deletes the row when there was nothing before (undefined)", () => {
    const db = openDb(":memory:");
    reserveOtpSlot(db, "hash-1", "123456", 300_000, 0, MIN_INTERVAL_MS);

    restoreOtpRow(db, "hash-1", undefined);

    expect(getOtpRow(db, "hash-1")).toBeUndefined();
  });

  it("restores the exact prior row rather than just clearing it", () => {
    const db = openDb(":memory:");
    const before = { email_hash: "hash-1", code: "111111", expires_at: 111, attempts: 2, requested_at: 5 };
    reserveOtpSlot(db, "hash-1", "111111", 111, 5, MIN_INTERVAL_MS);
    incrementOtpAttempts(db, "hash-1");
    incrementOtpAttempts(db, "hash-1");
    // A later, failed reservation attempt overwrote the row in memory...
    reserveOtpSlot(db, "hash-1", "999999", 999, 999_999, MIN_INTERVAL_MS);

    restoreOtpRow(db, "hash-1", before);

    expect(getOtpRow(db, "hash-1")).toEqual(before);
  });
});

describe("incrementOtpAttempts / deleteOtpRow", () => {
  it("increments attempts by 1 each call", () => {
    const db = openDb(":memory:");
    reserveOtpSlot(db, "hash-1", "123456", 300_000, 0, MIN_INTERVAL_MS);

    incrementOtpAttempts(db, "hash-1");
    expect(getOtpRow(db, "hash-1")?.attempts).toBe(1);
    incrementOtpAttempts(db, "hash-1");
    expect(getOtpRow(db, "hash-1")?.attempts).toBe(2);
  });

  it("removes the row entirely", () => {
    const db = openDb(":memory:");
    reserveOtpSlot(db, "hash-1", "123456", 300_000, 0, MIN_INTERVAL_MS);

    deleteOtpRow(db, "hash-1");

    expect(getOtpRow(db, "hash-1")).toBeUndefined();
  });
});

describe("upsertUser / isAnonymousUser", () => {
  it("is false for an unknown user", () => {
    const db = openDb(":memory:");
    expect(isAnonymousUser(db, "hash-1")).toBe(false);
  });

  it("records whether a newly-created user is anonymous", () => {
    const db = openDb(":memory:");
    upsertUser(db, "hash-1", 1000, true);
    expect(isAnonymousUser(db, "hash-1")).toBe(true);
  });

  it("defaults isAnonymous to false when omitted", () => {
    const db = openDb(":memory:");
    upsertUser(db, "hash-1", 1000);
    expect(isAnonymousUser(db, "hash-1")).toBe(false);
  });

  it("does not overwrite an existing user on conflict", () => {
    const db = openDb(":memory:");
    upsertUser(db, "hash-1", 1000, true);

    // A second upsert for the same hash (e.g. a retried request) must not
    // flip is_anonymous back to false underneath an already-real user.
    upsertUser(db, "hash-1", 2000, false);

    expect(isAnonymousUser(db, "hash-1")).toBe(true);
  });
});

describe("createSession / getSession / deleteSession", () => {
  it("returns undefined for an unknown token", () => {
    const db = openDb(":memory:");
    expect(getSession(db, "no-such-token")).toBeUndefined();
  });

  it("stores and retrieves a session", () => {
    const db = openDb(":memory:");
    createSession(db, "tok-1", "hash-1", 999_999);
    expect(getSession(db, "tok-1")).toEqual({
      token: "tok-1",
      email_hash: "hash-1",
      expires_at: 999_999,
    });
  });

  it("deletes a session", () => {
    const db = openDb(":memory:");
    createSession(db, "tok-1", "hash-1", 999_999);

    deleteSession(db, "tok-1");

    expect(getSession(db, "tok-1")).toBeUndefined();
  });
});
