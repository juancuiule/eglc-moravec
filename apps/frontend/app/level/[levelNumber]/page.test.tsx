import { describe, it, expect, vi, beforeEach } from "vitest";

const { cookiesMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/api/Api", () => ({
  Api: { fetchLevel: vi.fn(), fetchLevelStats: vi.fn() },
}));

import LevelPage from "./page";
import { Api } from "@/api/Api";

function cookieStore(rawSessionCookie?: string) {
  return {
    get: (name: string) =>
      rawSessionCookie !== undefined
        ? { name, value: rawSessionCookie }
        : undefined,
  };
}

function sessionCookieValue(token: string): string {
  return encodeURIComponent(JSON.stringify({ token, email: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Api.fetchLevel).mockResolvedValue({ "1d+1d": 100 });
  vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  cookiesMock.mockResolvedValue(cookieStore());
});

describe("LevelPage", () => {
  it("404s for a non-integer level number", async () => {
    await expect(
      LevelPage({ params: Promise.resolve({ levelNumber: "abc" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(Api.fetchLevel).not.toHaveBeenCalled();
  });

  it("404s when the backend has no such level", async () => {
    vi.mocked(Api.fetchLevel).mockResolvedValue(null);

    await expect(
      LevelPage({ params: Promise.resolve({ levelNumber: "999" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects home when the level is locked — no session at all reads as no progress", async () => {
    await expect(
      LevelPage({ params: Promise.resolve({ levelNumber: "2" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(Api.fetchLevelStats).not.toHaveBeenCalled();
  });

  it("redirects home when the level is locked — a session exists but the predecessor has no stars", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({});

    await expect(
      LevelPage({ params: Promise.resolve({ levelNumber: "2" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(Api.fetchLevelStats).toHaveBeenCalledWith("tok-abc");
  });

  it("renders the level when unlocked via the session's stats", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({
      "1": { stars: 1, totalTime: 1000, completedAt: "x" },
    });

    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "2" }),
    });
    expect(result.props).toMatchObject({
      levelNumber: 2,
      level: { "1d+1d": 100 },
    });
  });

  it("level 1 is always unlocked, even with no session", async () => {
    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "1" }),
    });
    expect(result.props).toMatchObject({ levelNumber: 1 });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails safe to locked, not open, when the stats fetch itself fails", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockRejectedValue(new Error("network down"));

    await expect(
      LevelPage({ params: Promise.resolve({ levelNumber: "2" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
