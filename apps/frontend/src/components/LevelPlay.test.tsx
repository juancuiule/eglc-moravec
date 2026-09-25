import { authStore } from "@/auth/store";
import { gameStore } from "@/game/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const { isBetterLevelRecordMock } = vi.hoisted(() => ({
  isBetterLevelRecordMock: vi.fn(),
}));

vi.mock("engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("engine")>();
  isBetterLevelRecordMock.mockImplementation(actual.isBetterLevelRecord);
  return { ...actual, isBetterLevelRecord: isBetterLevelRecordMock };
});

import { LevelPlay } from "./LevelPlay";
import { IntlTestProvider } from "@/testUtils/renderWithIntl";

import type { Level } from "@/level";

// FinishedScreen (rendered once the game store reaches "finished") calls
// useRouter() itself — unrelated to LevelPlay's own logic, but still needs
// a router context to render in this test environment.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/api/Api", () => ({
  Api: { fetchLevelStats: vi.fn(), syncResults: vi.fn(), fetchTrials: vi.fn() },
}));

import { Api, type LevelStats } from "@/api/Api";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { TRIALS_PER_LEVEL } from "engine";

// Fixtures, not the real catalog's levels — tests shouldn't depend on
// production Level content (which now lives in the backend).
const level1: Level = { "1d+1d": 100 };
const level2: Level = { "1dx1d": 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  vi.mocked(Api.syncResults).mockResolvedValue({ trials: [] });
  vi.mocked(Api.fetchTrials).mockResolvedValue([]);
  // LevelPlay reads unlock state + records from the local-first store —
  // hydrated and empty unless a test seeds it.
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
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
    <IntlTestProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </IntlTestProvider>,
  );
  return {
    ...result,
    rerenderWithQueryClient: (nextUi: React.ReactElement) =>
      result.rerender(
        <IntlTestProvider>
          <QueryClientProvider client={client}>{nextUi}</QueryClientProvider>
        </IntlTestProvider>,
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
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
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
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
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
      <LevelPlay
        nextLevelNumber={2}
        stats={{}}
        levelNumber={2}
        level={level2}
      />,
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
    <LevelPlay nextLevelNumber={2} levelNumber={1} level={level1} stats={{}} />,
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
    <LevelPlay nextLevelNumber={2} levelNumber={1} level={level1} stats={{}} />,
  );

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.runId).not.toBe(finishedRunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

test("the flush settles into a locally-derived record — never a falsy comparison", async () => {
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );

  finishCurrentRun();

  // The post-finish refresh path pulls server trials and re-derives locally.
  await waitFor(() => expect(Api.fetchTrials).toHaveBeenCalled());
  expect(
    isBetterLevelRecordMock.mock.calls.filter(([candidate]) => !candidate),
  ).toHaveLength(0);
  expect(
    isBetterLevelRecordMock.mock.calls.some(([candidate]) =>
      candidate ? candidate.stars === 0 : false,
    ),
  ).toBe(true);
});

test("a better record learned from the pull corrects the record baseline", async () => {
  // A 3-star level-1 run made on another device — merged into the store by
  // the post-finish pull, then into the record baseline.
  const otherRunId = crypto.randomUUID();
  vi.mocked(Api.fetchTrials).mockResolvedValue(
    Array.from({ length: TRIALS_PER_LEVEL }, (_, i) => ({
      id: crypto.randomUUID(),
      runId: otherRunId,
      runType: "level",
      categoryCodename: "1dx1d",
      levelNumber: 1,
      operands: [2, 3],
      answer: 6,
      correct: true,
      timeExceeded: false,
      timeTaken: 100,
      hintShown: false,
      playedAt: 1_700_000_000_000 + i * 100,
    })),
  );
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );

  finishCurrentRun();

  await waitFor(() =>
    expect(
      isBetterLevelRecordMock.mock.calls.some(
        ([candidate]) =>
          candidate?.stars === 3 && candidate?.totalTime === 2000,
      ),
    ).toBe(true),
  );
});

test("a same-mount Replay's New record badge reflects the just-finished run, not a stale stats prop", () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);

  function finishAllCorrect() {
    for (let i = 0; i < TRIALS_PER_LEVEL; i++) {
      const state = gameStore.getState().state;
      if (state.type !== "playing") throw new Error("not playing");
      act(() => {
        gameStore.getState().submitAnswer(state.currentOperation.result());
        gameStore.getState().advance();
      });
    }
  }

  const { getByText, queryByText } = renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );

  finishAllCorrect();
  const firstFinished = gameStore.getState().state;
  if (firstFinished.type !== "finished") throw new Error();
  expect(getByText("New record!")).toBeDefined();

  // Same-mount Replay — stats={{}} never changes, so if isNewRecord were
  // still compared against the original page-load prop, this would show
  // "New record!" again despite tying the run it should be compared to.
  act(() => {
    gameStore.getState().start(firstFinished.config);
  });
  finishAllCorrect();

  expect(gameStore.getState().state.type).toBe("finished");
  expect(queryByText("New record!")).toBeNull();
});
