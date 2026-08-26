import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LevelPlay } from "./LevelPlay";
import { gameStore } from "@/game/store";
import { TOTAL_TRIALS } from "@/game/index";
import type { Level } from "@/level";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

// Fixture, not the real catalog's level 1 — tests shouldn't depend on
// production Level content (which now lives in the backend).
const level1: Level = { "1d+1d": 100 };

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, val: string) => {
    localStorageStore[key] = val;
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    for (const k in localStorageStore) delete localStorageStore[k];
  },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  gameStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function finishCurrentRun() {
  for (let i = 0; i < TOTAL_TRIALS; i++) {
    act(() => {
      gameStore.getState().timeUp(null);
      gameStore.getState().advance();
    });
  }
}

test("revisiting the same level after finishing it starts a fresh run, not the stale Finished state", () => {
  const { unmount } = render(<LevelPlay levelNumber={1} level={level1} />);

  expect(gameStore.getState().state.type).toBe("playing");

  finishCurrentRun();
  expect(gameStore.getState().state.type).toBe("finished");
  const finishedRunId =
    gameStore.getState().state.type === "finished"
      ? (gameStore.getState().state as { runId: string }).runId
      : null;

  // Leaving the route (e.g. navigating to the levels menu) unmounts LevelPlay.
  unmount();

  // Revisiting the same level remounts it — this should not resume the
  // stale Finished state from the previous visit.
  render(<LevelPlay levelNumber={1} level={level1} />);

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.runId).not.toBe(finishedRunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});
