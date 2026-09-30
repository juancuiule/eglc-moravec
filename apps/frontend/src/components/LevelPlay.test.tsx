import { authStore } from "@/auth/store";
import { gameStore } from "@/game/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const { isBetterLevelRecordMock, replaceMock } = vi.hoisted(() => ({
  isBetterLevelRecordMock: vi.fn(),
  replaceMock: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

vi.mock("@/api/Api", () => ({
  Api: { fetchLevelStats: vi.fn(), sync: vi.fn() },
}));

import { Api, type LevelStats } from "@/api/Api";
import { localStore, resetLocalData, TRIALS_TABLE } from "@/local/store";
import { mergeServerTrials } from "@/local/trials";
import { syncStatus } from "@/local/syncEngine";
import { TRIALS_PER_LEVEL } from "engine";

// Fixtures, not the real catalog's levels — tests shouldn't depend on
// production Level content (which now lives in the backend).
const level1: Level = { "1d+1d": 100 };
const level2: Level = { "1dx1d": 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  vi.mocked(Api.sync).mockResolvedValue({ cursor: 0, trials: [] });
  // LevelPlay reads unlock state + records from the local-first store —
  // hydrated and empty unless a test seeds it.
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
  // The engine isn't running in tests — default to "first pull settled" so
  // the locked-redirect gate resolves immediately; tests that exercise the
  // pending state set it explicitly.
  syncStatus.setState({ pullSettledToken: "test-token" });
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
  // Level 2 must be unlocked for a run to start there at all.
  const unlocking: Record<string, LevelStats> = {
    "1": { stars: 3, totalTime: 5_000, completedAt: "2025-01-01T00:00:00Z" },
  };
  act(() => {
    rerenderWithQueryClient(
      <LevelPlay
        nextLevelNumber={2}
        stats={unlocking}
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
  await waitFor(() => expect(Api.sync).toHaveBeenCalled());
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
  vi.mocked(Api.sync).mockResolvedValue({
    cursor: 1,
    trials: Array.from({ length: TRIALS_PER_LEVEL }, (_, i) => ({
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
  });
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

test("a locked-looking level holds the redirect until the first pull settles", async () => {
  // Fresh device: store hydrated but empty, server seed failed (stats={}) —
  // the boot pull hasn't landed yet.
  syncStatus.setState({ pullSettledToken: null });
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={3} stats={{}} levelNumber={2} level={level2} />,
  );

  // Locked-looking, but unresolved — hold, don't bounce.
  expect(replaceMock).not.toHaveBeenCalled();

  // The pull settles with nothing to merge — NOW the locked verdict holds.
  act(() => syncStatus.setState({ pullSettledToken: "test-token" }));
  expect(replaceMock).toHaveBeenCalledWith("/");
});

test("a pull landing during the wait can still unlock the deep link", async () => {
  syncStatus.setState({ pullSettledToken: null });
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={3} stats={{}} levelNumber={2} level={level2} />,
  );
  expect(replaceMock).not.toHaveBeenCalled();

  // Server history arrives before the pull "settles": a 3-star level-1 run
  // merges in, level 2 unlocks, and the gate opens without a redirect.
  const runId = crypto.randomUUID();
  act(() => {
    mergeServerTrials(
      Array.from({ length: TRIALS_PER_LEVEL }, (_, i) => ({
        id: crypto.randomUUID(),
        runId,
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
    syncStatus.setState({ pullSettledToken: "test-token" });
  });

  expect(replaceMock).not.toHaveBeenCalled();
  expect(gameStore.getState().state.type).toBe("playing");
});

test("a better record pulled mid-play becomes the baseline — a worse finish earns no badge", async () => {
  const { queryByText } = renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );
  expect(gameStore.getState().state.type).toBe("playing");

  // Mid-play, another device's 3-star level-1 run arrives via a pull-merge —
  // e.g. the boot flush landing after mount. The ratchet must follow it
  // before this device finishes.
  const otherRunId = crypto.randomUUID();
  act(() => {
    mergeServerTrials(
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
  });

  // This device then finishes a worse run (all timeouts → 0 stars). With a
  // stale baseline this would wrongly claim a new record.
  finishCurrentRun();
  await waitFor(() => expect(gameStore.getState().state.type).toBe("finished"));
  expect(queryByText("New record!")).toBeNull();
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

test("a token change re-arms the pull gate — a new session's deep link waits for ITS pull", () => {
  // An earlier session settled its pull; Alice then signed in. With no
  // server seed and empty local store, level 3 looks locked — but the gate
  // must wait for the pull under ALICE's token, not the previous one.
  syncStatus.setState({ pullSettledToken: "previous-anon-token" });
  renderWithQueryClient(
    <LevelPlay
      nextLevelNumber={null}
      stats={{}}
      levelNumber={3}
      level={level1}
    />,
  );
  expect(replaceMock).not.toHaveBeenCalled(); // still waiting on this session's pull

  act(() => syncStatus.setState({ pullSettledToken: "test-token" }));
  expect(replaceMock).toHaveBeenCalledWith("/"); // settled + empty → locked
});

test("a session wipe drops the server seed — an open level re-gates as locked for the next user", () => {
  // Levels 1+2 starred in the server seed → level 3 plays under Alice's
  // session. Logout wipes → the seed belonged to a dead session and must
  // not keep unlocking for whoever picks up this browser.
  const seed: Record<string, LevelStats> = {
    "1": { stars: 3, totalTime: 5_000, completedAt: "2025-01-01T00:00:00Z" },
    "2": { stars: 3, totalTime: 5_000, completedAt: "2025-01-01T00:00:00Z" },
  };
  renderWithQueryClient(
    <LevelPlay
      nextLevelNumber={null}
      stats={seed}
      levelNumber={3}
      level={level1}
    />,
  );
  expect(replaceMock).not.toHaveBeenCalled();
  expect(gameStore.getState().state.type).toBe("playing");

  act(() => resetLocalData()); // the logout/expiry boundary

  // Empty local store + dropped seed → locked → the gate redirects.
  expect(replaceMock).toHaveBeenCalledWith("/");
});

test("the run does not start behind the loading panel — only once hydrated and unlocked", () => {
  act(() => {
    localStore.setValue("hydrated", false);
  });
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );
  // Still loading: the machine must not have stamped a first-trial start
  // time that the hidden question would then time out against.
  expect(gameStore.getState().state.type).toBe("idle");

  act(() => {
    localStore.setValue("hydrated", true);
  });
  expect(gameStore.getState().state.type).toBe("playing");
});

test("a locked verdict waiting on the first pull doesn't start the run; the unlock starts it once, without restart", () => {
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={3} stats={{}} levelNumber={2} level={level2} />,
  );
  expect(gameStore.getState().state.type).toBe("idle");

  const runId = crypto.randomUUID();
  act(() => {
    mergeServerTrials(
      Array.from({ length: TRIALS_PER_LEVEL }, (_, i) => ({
        id: crypto.randomUUID(),
        runId,
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
  });
  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  const startedRunId = state.type === "playing" ? state.runId : null;

  // A later settle re-renders; the active run must not be restarted.
  act(() => {
    syncStatus.setState({ pullSettledToken: "test-token" });
  });
  const after = gameStore.getState().state;
  expect(after.type === "playing" && after.runId).toBe(startedRunId);
});

test("a rendered level seeds its mix into the local catalog — offline play survives a failed bulk refresh", () => {
  renderWithQueryClient(
    <LevelPlay nextLevelNumber={2} stats={{}} levelNumber={1} level={level1} />,
  );

  expect(localStore.getCell("levels", "1", "mix")).toBe(JSON.stringify(level1));
});

test("a session wipe on an open level resets the record baseline — the next player's first run is a record", () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  // Alice's record ties exactly what a perfect run under the frozen clock
  // produces (3 stars, 0ms) — so with her baseline still in place the next
  // player's perfect run would NOT read as a record.
  const seed: Record<string, LevelStats> = {
    "1": { stars: 3, totalTime: 0, completedAt: "2025-01-01T00:00:00Z" },
  };
  const { queryByText } = renderWithQueryClient(
    <LevelPlay
      nextLevelNumber={2}
      stats={seed}
      levelNumber={1}
      level={level1}
    />,
  );
  expect(gameStore.getState().state.type).toBe("playing");

  // Alice logs out — level 1 is always unlocked, so the mount survives.
  act(() => {
    resetLocalData();
  });
  expect(gameStore.getState().state.type).toBe("playing");

  for (let i = 0; i < TRIALS_PER_LEVEL; i++) {
    const state = gameStore.getState().state;
    if (state.type !== "playing") throw new Error("not playing");
    act(() => {
      gameStore.getState().submitAnswer(state.currentOperation.result());
      gameStore.getState().advance();
    });
  }
  expect(queryByText("New record!")).not.toBeNull();
});
