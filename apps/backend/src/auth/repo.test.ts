import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateTrialResult } from "engine";
import { openDb } from "../db.js";
import { getTrialResultsForUser, insertTrialResults } from "../sync/repo.js";
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
  cleanupExpiredAuthData,
  completeOtpVerification,
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
    const claimed = reserveOtpSlot(
      db,
      "hash-1",
      "123456",
      now + 300_000,
      now,
      MIN_INTERVAL_MS,
    );

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

    reserveOtpSlot(
      db,
      "hash-1",
      "999999",
      now + 400_000,
      now + MIN_INTERVAL_MS,
      MIN_INTERVAL_MS,
    );

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

    restoreOtpRow(db, "hash-1", undefined, {
      code: "123456",
      requestedAt: 0,
    });

    expect(getOtpRow(db, "hash-1")).toBeUndefined();
  });

  it("restores the exact prior row rather than just clearing it", () => {
    const db = openDb(":memory:");
    const before = {
      email_hash: "hash-1",
      code: "111111",
      expires_at: 111,
      attempts: 2,
      requested_at: 5,
    };
    reserveOtpSlot(db, "hash-1", "111111", 111, 5, MIN_INTERVAL_MS);
    incrementOtpAttempts(db, "hash-1");
    incrementOtpAttempts(db, "hash-1");
    // A later, failed reservation attempt overwrote the row in memory...
    reserveOtpSlot(db, "hash-1", "999999", 999, 999_999, MIN_INTERVAL_MS);

    restoreOtpRow(db, "hash-1", before, {
      code: "999999",
      requestedAt: 999_999,
    });

    expect(getOtpRow(db, "hash-1")).toEqual(before);
  });

  it("does not overwrite a newer reservation when an older delivery fails", () => {
    const db = openDb(":memory:");
    const before = {
      email_hash: "hash-1",
      code: "111111",
      expires_at: 111,
      attempts: 2,
      requested_at: 5,
    };
    reserveOtpSlot(db, "hash-1", "111111", 111, 5, MIN_INTERVAL_MS);
    incrementOtpAttempts(db, "hash-1");
    incrementOtpAttempts(db, "hash-1");
    reserveOtpSlot(db, "hash-1", "222222", 222, 100_000, MIN_INTERVAL_MS);
    reserveOtpSlot(db, "hash-1", "333333", 333, 200_000, MIN_INTERVAL_MS);

    restoreOtpRow(db, "hash-1", before, {
      code: "222222",
      requestedAt: 100_000,
    });

    expect(getOtpRow(db, "hash-1")).toEqual({
      email_hash: "hash-1",
      code: "333333",
      expires_at: 333,
      attempts: 0,
      requested_at: 200_000,
    });
  });

  it("uses the code to distinguish reservations with equal timestamps", () => {
    const db = openDb(":memory:");
    reserveOtpSlot(db, "hash-1", "222222", 222, 100_000, MIN_INTERVAL_MS);
    reserveOtpSlot(db, "hash-1", "333333", 333, 100_000, 0);

    restoreOtpRow(db, "hash-1", undefined, {
      code: "222222",
      requestedAt: 100_000,
    });

    expect(getOtpRow(db, "hash-1")?.code).toBe("333333");
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

describe("cleanupExpiredAuthData", () => {
  it("deletes expired auth rows and only genuinely orphan anonymous users", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;

    upsertUser(db, "verified-orphan", 1);
    upsertUser(db, "anonymous-orphan", 2, true);
    upsertUser(db, "anonymous-with-expired-session", 3, true);
    upsertUser(db, "anonymous-with-live-session", 4, true);
    upsertUser(db, "anonymous-with-trial", 5, true);

    createSession(db, "expired-orphan-session", "anonymous-orphan", now - 1);
    createSession(
      db,
      "expired-only-session",
      "anonymous-with-expired-session",
      now - 1,
    );
    createSession(db, "expired-data-session", "anonymous-with-trial", now - 1);
    createSession(db, "live-session", "anonymous-with-live-session", now);
    reserveOtpSlot(db, "expired-otp", "111111", now - 1, 1, 0);
    reserveOtpSlot(db, "live-otp", "222222", now, 2, 0);
    insertTrialResults(db, "anonymous-with-trial", [
      evaluateTrialResult({
        id: randomUUID(),
        levelNumber: 1,
        categoryCodename: "1d+1d",
        timeTaken: 1_000,
        playedAt: now,
        operands: [1, 2],
        answer: 3,
        hintShown: false,
        runId: randomUUID(),
        runType: "level",
      }),
    ]);

    cleanupExpiredAuthData(db, now);

    expect(getSession(db, "expired-orphan-session")).toBeUndefined();
    expect(getSession(db, "expired-data-session")).toBeUndefined();
    expect(getSession(db, "live-session")).toBeDefined();
    expect(getOtpRow(db, "expired-otp")).toBeUndefined();
    expect(getOtpRow(db, "live-otp")).toBeDefined();
    expect(isAnonymousUser(db, "anonymous-orphan")).toBe(false);
    expect(isAnonymousUser(db, "anonymous-with-expired-session")).toBe(false);
    expect(isAnonymousUser(db, "anonymous-with-live-session")).toBe(true);
    expect(isAnonymousUser(db, "anonymous-with-trial")).toBe(true);
    expect(
      db
        .prepare("SELECT 1 FROM users WHERE email_hash = ?")
        .get("verified-orphan"),
    ).toBeDefined();
  });

  it("removes expired rows before deleting orphan anonymous users", () => {
    const db = openDb(":memory:");
    const now = 1_000_000;
    upsertUser(db, "anonymous-orphan", 1, true);
    createSession(db, "expired-session", "anonymous-orphan", now - 1);
    reserveOtpSlot(db, "anonymous-orphan", "111111", now - 1, 1, 0);
    db.exec(`CREATE TRIGGER require_auth_cleanup_before_user_delete
      BEFORE DELETE ON users
      WHEN EXISTS (
        SELECT 1 FROM sessions WHERE email_hash = OLD.email_hash
      ) OR EXISTS (
        SELECT 1 FROM otp_codes WHERE email_hash = OLD.email_hash
      )
      BEGIN
        SELECT RAISE(ABORT, 'auth rows still exist');
      END`);

    expect(() => cleanupExpiredAuthData(db, now)).not.toThrow();
    expect(isAnonymousUser(db, "anonymous-orphan")).toBe(false);
  });
});

describe("completeOtpVerification", () => {
  it("rolls back OTP consumption, identity merge, and session changes when a late statement fails", () => {
    const db = openDb(":memory:");
    const targetHash = "verified-hash";
    const anonymousHash = "anonymous-hash";
    reserveOtpSlot(db, targetHash, "123456", 300_000, 0, MIN_INTERVAL_MS);
    upsertUser(db, targetHash, 1_000);
    upsertUser(db, anonymousHash, 2_000, true);
    createSession(db, "verified-session", targetHash, 999_999);
    createSession(db, "anonymous-session", anonymousHash, 999_999);
    insertTrialResults(db, anonymousHash, [
      evaluateTrialResult({
        id: randomUUID(),
        levelNumber: 3,
        categoryCodename: "1d+1d",
        timeTaken: 1_200,
        playedAt: 1_700_000_000_000,
        operands: [4, 5],
        answer: 9,
        hintShown: false,
        runId: randomUUID(),
        runType: "level",
      }),
    ]);
    db.exec(`CREATE TRIGGER fail_anonymous_user_delete
      BEFORE DELETE ON users
      WHEN OLD.email_hash = '${anonymousHash}'
      BEGIN
        SELECT RAISE(ABORT, 'injected user deletion failure');
      END`);

    expect(() =>
      completeOtpVerification(db, {
        emailHash: targetHash,
        anonymousEmailHash: anonymousHash,
        token: "new-session",
        expiresAt: 999_999,
        createdAt: 3_000,
      }),
    ).toThrow("injected user deletion failure");

    expect(getOtpRow(db, targetHash)?.code).toBe("123456");
    expect(getSession(db, "new-session")).toBeUndefined();
    expect(getSession(db, "verified-session")?.email_hash).toBe(targetHash);
    expect(getSession(db, "anonymous-session")?.email_hash).toBe(anonymousHash);
    expect(getTrialResultsForUser(db, anonymousHash)).toHaveLength(1);
    expect(getTrialResultsForUser(db, targetHash)).toHaveLength(0);
    expect(isAnonymousUser(db, anonymousHash)).toBe(true);
  });
});
