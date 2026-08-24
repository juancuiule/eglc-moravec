import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LevelPlay } from "./LevelPlay";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const load = vi.fn();
const reset = vi.fn();
const gameState: { type: string } = { type: "loading" };
vi.mock("@/game/store", () => ({
  gameStore: {
    getState: () => ({ state: gameState, reset }),
    subscribe: () => () => {},
  },
  useGame: (selector: (s: { state: typeof gameState; load: typeof load }) => unknown) =>
    selector({ state: gameState, load }),
}));

vi.mock("@/levels/query", () => ({
  getLocalLevelMix: vi.fn(),
}));

import { getLocalLevelMix } from "@/levels/query";

beforeEach(() => {
  replace.mockClear();
  load.mockClear();
  reset.mockClear();
  gameState.type = "loading";
  vi.mocked(getLocalLevelMix).mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// Level 1 is always unlocked (see isLevelUnlocked) — keeps these tests from
// needing to stub localStorage-backed LevelStats just to reach the code
// under test.
const LEVEL_NUMBER = 1;

test("loads the live-fetched Level directly when the backend was reachable", async () => {
  render(<LevelPlay levelNumber={LEVEL_NUMBER} level={{ "1d+1d": 100 }} />);

  await waitFor(() => expect(load).toHaveBeenCalledWith({
    levelNumber: LEVEL_NUMBER,
    level: { "1d+1d": 100 },
    totalTrials: expect.any(Number),
  }));
  expect(getLocalLevelMix).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});

test("falls back to the locally-replicated Level, with a console warning, when the live fetch failed", async () => {
  vi.mocked(getLocalLevelMix).mockResolvedValue({ "2dx1d": 100 });

  render(<LevelPlay levelNumber={LEVEL_NUMBER} level={null} />);

  await waitFor(() => expect(load).toHaveBeenCalledWith({
    levelNumber: LEVEL_NUMBER,
    level: { "2dx1d": 100 },
    totalTrials: expect.any(Number),
  }));
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`Level ${LEVEL_NUMBER}`));
});

test("shows an unavailable message, and never calls load, when neither the live fetch nor the local replica has the Level", async () => {
  vi.mocked(getLocalLevelMix).mockResolvedValue(null);

  render(<LevelPlay levelNumber={LEVEL_NUMBER} level={null} />);

  expect(await screen.findByText(/isn't available offline/)).toBeDefined();
  expect(load).not.toHaveBeenCalled();
});

test("never loads a locked Level, even though router.replace() doesn't unmount the page synchronously", async () => {
  // Level 2 with no LevelStats recorded is locked (see isLevelUnlocked) —
  // unlike level 1, which every other test in this file uses specifically
  // because it's always unlocked.
  const LOCKED_LEVEL = 2;

  render(<LevelPlay levelNumber={LOCKED_LEVEL} level={{ "1d+1d": 100 }} />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  expect(load).not.toHaveBeenCalled();
});
