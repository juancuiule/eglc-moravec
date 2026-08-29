import { describe, it, expect, beforeEach } from "vitest";
import {
  parseSessionCookie,
  loadSession,
  saveSession,
  clearSession,
  SESSION_COOKIE,
} from "./session";

function clearAllCookies() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

describe("parseSessionCookie", () => {
  it("returns null for null/undefined input", () => {
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie(undefined)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseSessionCookie("not-json")).toBeNull();
    expect(parseSessionCookie("%")).toBeNull(); // invalid URI encoding
  });

  it("parses a URI-encoded JSON session", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ token: "t1", email: "a@b.com" }),
    );
    expect(parseSessionCookie(raw)).toEqual({ token: "t1", email: "a@b.com" });
  });
});

describe("loadSession / saveSession / clearSession (browser cookie)", () => {
  beforeEach(() => {
    clearAllCookies();
  });

  it("returns null when no session cookie is set", () => {
    expect(loadSession()).toBeNull();
  });

  it("round-trips a saved session", () => {
    saveSession({ token: "tok", email: "a@b.com" });
    expect(loadSession()).toEqual({ token: "tok", email: "a@b.com" });
  });

  it("round-trips an anonymous session (null email)", () => {
    saveSession({ token: "tok", email: null });
    expect(loadSession()).toEqual({ token: "tok", email: null });
  });

  it("clearSession removes the cookie", () => {
    saveSession({ token: "tok", email: "a@b.com" });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
