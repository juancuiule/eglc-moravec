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
  Api: {
    fetchLevel: vi.fn(),
    fetchLevelNumbers: vi.fn(),
    fetchLevelStats: vi.fn(),
  },
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
  vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2, 3]);
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

  it("renders without a session — unlock gating is client-side now (LevelPlay consults the local store)", async () => {
    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "2" }),
    });
    expect(result.props).toMatchObject({ levelNumber: 2 });
    expect(Api.fetchLevelStats).not.toHaveBeenCalled();
  });

  it("renders for a locked-for-the-server level too — a local-only run may unlock what the server hasn't seen", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({});

    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "2" }),
    });
    expect(Api.fetchLevelStats).toHaveBeenCalledWith("tok-abc");
    expect(result.props.stats).toEqual({});
  });

  it("passes the session's stats through as the seed", async () => {
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
      nextLevelNumber: 3,
    });
  });

  it("level 1 is always unlocked, even with no session", async () => {
    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "1" }),
    });
    expect(result.props).toMatchObject({ levelNumber: 1, nextLevelNumber: 2 });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("passes a null nextLevelNumber when the catalog ends at this level", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({
      "2": { stars: 1, totalTime: 1000, completedAt: "x" },
    });

    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "3" }),
    });
    expect(result.props).toMatchObject({
      levelNumber: 3,
      nextLevelNumber: null,
    });
  });

  it("still renders when the stats fetch fails — the seed is empty and the local store decides", async () => {
    cookiesMock.mockResolvedValue(cookieStore(sessionCookieValue("tok-abc")));
    vi.mocked(Api.fetchLevelStats).mockRejectedValue(new Error("network down"));

    const result = await LevelPage({
      params: Promise.resolve({ levelNumber: "2" }),
    });
    expect(result.props.stats).toEqual({});
  });
});
