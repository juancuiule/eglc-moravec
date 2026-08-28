import { act, render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LevelPlay } from "./LevelPlay";
import { gameStore } from "@/game/store";
import { TOTAL_TRIALS } from "@/game/index";
import { saveLevelStats } from "@/storage/levelStats";
import { store } from "@/storage/store";
import { storageStore } from "@/storage/storageStore";
import type { Level } from "@/level";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

// Fixtures, not the real catalog's levels — tests shouldn't depend on
// production Level content (which now lives in the backend).
const level1: Level = { "1d+1d": 100 };
const level2: Level = { "1dx1d": 100 };

beforeEach(() => {
  store.delTables();
  storageStore.setState({ ready: true });
  gameStore.getState().reset();
});

function finishCurrentRun() {
  for (let i = 0; i < TOTAL_TRIALS; i++) {
    act(() => {
      gameStore.getState().timeUp(null);
      gameStore.getState().advance();
    });
  }
}

test("fresh mount starts a Playing run for the given level", () => {
  render(<LevelPlay levelNumber={1} level={level1} />);

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.config.levelNumber).toBe(1);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

test("switching to a different level mid-play abandons the in-progress run and starts fresh for the new level", () => {
  // Level 2 needs level 1 already recorded to be unlocked.
  saveLevelStats({ "1": { stars: 3, totalTime: 1000, completedAt: new Date().toISOString() } });

  const { rerender } = render(<LevelPlay levelNumber={1} level={level1} />);
  expect(gameStore.getState().state.type).toBe("playing");
  const level1RunId =
    gameStore.getState().state.type === "playing"
      ? (gameStore.getState().state as { runId: string }).runId
      : null;

  // Still mid-play on level 1 — navigating straight to level 2's URL
  // rerenders this same component with a new levelNumber, no unmount.
  act(() => {
    rerender(<LevelPlay levelNumber={2} level={level2} />);
  });

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.config.levelNumber).toBe(2);
    expect(state.runId).not.toBe(level1RunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

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
