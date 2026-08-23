import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/Api", () => ({
  Api: { checkSession: vi.fn() },
}));

import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { Api } from "@/api/Api";
import { SESSION_COOKIE } from "@/storage/session";

function requestWithCookie(raw: string | null, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers(extraHeaders);
  if (raw !== null) headers.set("cookie", `${SESSION_COOKIE}=${raw}`);
  return new NextRequest("http://localhost:3001/", { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through with no session cookie, never calling the backend", async () => {
    const res = await proxy(requestWithCookie(null));
    expect(Api.checkSession).not.toHaveBeenCalled();
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("validates a present session cookie against the backend", async () => {
    vi.mocked(Api.checkSession).mockResolvedValue(true);
    const raw = encodeURIComponent(JSON.stringify({ token: "t1", email: "a@b.com" }));

    await proxy(requestWithCookie(raw));

    expect(Api.checkSession).toHaveBeenCalledWith("t1");
  });

  it("deletes the cookie on the response when the session is invalid", async () => {
    vi.mocked(Api.checkSession).mockResolvedValue(false);
    const raw = encodeURIComponent(JSON.stringify({ token: "stale", email: "a@b.com" }));

    const res = await proxy(requestWithCookie(raw));

    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });

  it("leaves the cookie alone when the session is valid", async () => {
    vi.mocked(Api.checkSession).mockResolvedValue(true);
    const raw = encodeURIComponent(JSON.stringify({ token: "t1", email: "a@b.com" }));

    const res = await proxy(requestWithCookie(raw));

    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("fails open (keeps the session) when the backend check itself errors", async () => {
    vi.mocked(Api.checkSession).mockRejectedValue(new Error("network down"));
    const raw = encodeURIComponent(JSON.stringify({ token: "t1", email: "a@b.com" }));

    const res = await proxy(requestWithCookie(raw));

    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("skips validation entirely for prefetch requests", async () => {
    const raw = encodeURIComponent(JSON.stringify({ token: "t1", email: "a@b.com" }));

    await proxy(requestWithCookie(raw, { "next-router-prefetch": "1" }));
    await proxy(requestWithCookie(raw, { purpose: "prefetch" }));

    expect(Api.checkSession).not.toHaveBeenCalled();
  });
});
