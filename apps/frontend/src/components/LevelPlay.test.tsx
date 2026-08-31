import { authStore } from "@/auth/store";
import { gameStore } from "@/game/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LevelPlay } from "./LevelPlay";

import type { Level } from "@/level";

// FinishedScreen (rendered once the game store reaches "finished") calls
// useRouter() itself — unrelated to LevelPlay's own logic, but still needs
// a router context to render in this test environment.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/api/Api", () => ({
  Api: { fetchLevelStats: vi.fn(), syncResults: vi.fn() },
}));

import { Api } from "@/api/Api";
import { TRIALS_PER_LEVEL } from "engine";

// Fixtures, not the real catalog's levels — tests shouldn't depend on
// production Level content (which now lives in the backend).
const level1: Level = { "1d+1d": 100 };
const level2: Level = { "1dx1d": 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  vi.mocked(Api.syncResults).mockResolvedValue({ trials: [] });
  gameStore.getState().reset();
  // persistFinishedLevel's push needs a session token — every real player
  // has one automatically (see AuthBoot), so tests simulate that same
  // anonymous baseline directly.
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
});

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return {
    ...result,
    rerenderWithQueryClient: (nextUi: React.ReactElement) =>
      result.rerender(
        <QueryClientProvider client={client}>{nextUi}</QueryClientProvider>,
      ),
  };
}

function finishCurrentRun() {
  for (let i = 0; i < TRIALS_PER_LEVEL; i++) {
    act(() => {
      gameStore.getState().timeUp(null);
      gameStore.getState().advance();
    });
  }
}

test("fresh mount starts a Playing run for the given level", () => {
  renderWithQueryClient(
    <LevelPlay stats={{}} levelNumber={1} level={level1} />,
  );

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.config.levelNumber).toBe(1);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

test("switching to a different level mid-play abandons the in-progress run and starts fresh for the new level", () => {
  const { rerenderWithQueryClient } = renderWithQueryClient(
    <LevelPlay stats={{}} levelNumber={1} level={level1} />,
  );
  expect(gameStore.getState().state.type).toBe("playing");
  const level1RunId =
    gameStore.getState().state.type === "playing"
      ? (gameStore.getState().state as { runId: string }).runId
      : null;

  // Still mid-play on level 1 — navigating straight to level 2's URL
  // rerenders this same component with a new levelNumber, no unmount.
  act(() => {
    rerenderWithQueryClient(
      <LevelPlay stats={{}} levelNumber={2} level={level2} />,
    );
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
  const { unmount } = renderWithQueryClient(
    <LevelPlay levelNumber={1} level={level1} stats={{}} />,
  );

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
  renderWithQueryClient(
    <LevelPlay levelNumber={1} level={level1} stats={{}} />,
  );

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.runId).not.toBe(finishedRunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});
