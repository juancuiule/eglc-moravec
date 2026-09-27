import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsScreen } from "./StatsScreen";
import { authStore } from "@/auth/store";
import { localStore, resetLocalData, TRIALS_TABLE } from "@/local/store";
import { IntlTestProvider } from "@/testUtils/renderWithIntl";
import type { SyncedTrial } from "../api/Api";

vi.mock("@/api/Api", () => ({
  Api: { fetchTrials: vi.fn() },
}));

import { Api } from "@/api/Api";

beforeEach(() => {
  // The read model is the local store: hydrated and empty each test; the
  // mocked fetchTrials still exercises the pull-merge path.
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
  vi.mocked(Api.fetchTrials).mockResolvedValue([]);
  // Every real player has a session by the time this renders (see
  // AuthBoot) — the trials fetch needs a token to run at all.
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
});

function renderWithQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlTestProvider>
      <QueryClientProvider client={client}>
        <StatsScreen />
      </QueryClientProvider>
    </IntlTestProvider>,
  );
}

test("a category row with data is a real button, keyboard-reachable and screen-reader visible", async () => {
  const trials: SyncedTrial[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      levelNumber: 1,
      categoryCodename: "1d+1d",
      operands: [1, 1],
      answer: 2,
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: 1_700_000_000_000,
      hintShown: false,
      runType: "level",
    },
  ];
  vi.mocked(Api.fetchTrials).mockResolvedValue(trials);

  renderWithQueryClient();

  const row = await screen.findByRole("button", { name: /1d\+1d/ });
  expect(row.tagName).toBe("BUTTON");
});

test("a category row with no data is not rendered as an interactive control", async () => {
  // Seed one category with data so the list renders at all, and check a
  // *different*, data-less category's row isn't an interactive control.
  const trials: SyncedTrial[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      levelNumber: 1,
      categoryCodename: "1d+1d",
      operands: [1, 1],
      answer: 2,
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: 1_700_000_000_000,
      hintShown: false,
      runType: "level",
    },
  ];
  vi.mocked(Api.fetchTrials).mockResolvedValue(trials);

  renderWithQueryClient();

  const row = await screen.findByText("1dx1d");
  expect(row.closest("button")).toBeNull();
});

test("Level and Practice trials are never merged — a Practice-only trial doesn't show under the Level tab", async () => {
  const trials: SyncedTrial[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      levelNumber: null,
      categoryCodename: "1d+1d",
      operands: [1, 1],
      answer: 2,
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: 1_700_000_000_000,
      hintShown: false,
      runType: "practice",
    },
  ];
  vi.mocked(Api.fetchTrials).mockResolvedValue(trials);

  renderWithQueryClient();

  expect(await screen.findByText(/No data yet/)).toBeDefined();
  expect(screen.queryByRole("button", { name: /1d\+1d/ })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Practice" }));
  expect(await screen.findByRole("button", { name: /1d\+1d/ })).toBeDefined();
});

test("the active Level/Practice tab exposes its selected state via aria-pressed, not color alone", async () => {
  renderWithQueryClient();
  await screen.findByText(/No data yet/);

  const levelTab = screen.getByRole("button", { name: "Level" });
  const practiceTab = screen.getByRole("button", { name: "Practice" });
  expect(levelTab.getAttribute("aria-pressed")).toBe("true");
  expect(practiceTab.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(practiceTab);

  expect(levelTab.getAttribute("aria-pressed")).toBe("false");
  expect(practiceTab.getAttribute("aria-pressed")).toBe("true");
});

test("the empty state links to a next action, on both tabs", async () => {
  renderWithQueryClient();

  expect(
    (
      await screen.findByRole("link", { name: "complete some levels" })
    ).getAttribute("href"),
  ).toBe("/levels");

  fireEvent.click(screen.getByRole("button", { name: "Practice" }));

  expect(
    screen
      .getByRole("link", { name: "practice a category" })
      .getAttribute("href"),
  ).toBe("/practice");
});

test("shows an error message when the trial fetch fails, with a retry", async () => {
  vi.mocked(Api.fetchTrials).mockRejectedValue(new Error("network down"));
  renderWithQueryClient();

  expect(await screen.findByText(/Couldn't load stats/)).toBeDefined();
  // The error and the empty state are mutually exclusive — a failed pull
  // over an empty local store must not show both at once.
  expect(screen.queryByText(/complete some levels/)).toBeNull();

  vi.mocked(Api.fetchTrials).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText(/No data yet/)).toBeDefined();
});

test("a pull resolving after a logout wipe does not repopulate the store", async () => {
  let resolvePull: (v: SyncedTrial[]) => void = () => {};
  vi.mocked(Api.fetchTrials).mockImplementation(
    () => new Promise((res) => (resolvePull = res)),
  );
  renderWithQueryClient();

  // Logout's wipe lands while this screen's fetch is still in flight.
  act(() => resetLocalData());
  await act(async () => {
    resolvePull([
      {
        id: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        runType: "level",
        categoryCodename: "1dx1d",
        levelNumber: 1,
        operands: [2, 3],
        answer: 6,
        correct: true,
        timeExceeded: false,
        timeTaken: 900,
        hintShown: false,
        playedAt: 1_700_000_000_000,
      },
    ]);
  });

  // The wiped store stays empty — the previous session's rows never
  // re-enter through the stale response.
  expect(localStore.getTable(TRIALS_TABLE)).toEqual({});
});

test("renders the activity calendar and days-trained caption once trials exist", async () => {
  vi.mocked(Api.fetchTrials).mockResolvedValue([
    {
      id: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      levelNumber: 1,
      categoryCodename: "1d+1d",
      operands: [1, 1],
      answer: 2,
      correct: true,
      timeExceeded: false,
      timeTaken: 1000,
      playedAt: Date.now(),
      hintShown: false,
      runType: "level",
    },
  ]);
  renderWithQueryClient();

  expect(await screen.findByRole("img", { name: "Activity" })).toBeDefined();
  expect(await screen.findByText("1 day trained this month")).toBeDefined();
});

test("the export buttons trigger real CSV and JSON downloads", async () => {
  const trialFixture: SyncedTrial = {
    id: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    levelNumber: 1,
    categoryCodename: "1d+1d",
    operands: [1, 1],
    answer: 2,
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    hintShown: false,
    runType: "level",
  };
  vi.mocked(Api.fetchTrials).mockResolvedValue([trialFixture]);

  const createUrl = vi.fn((_blob: Blob) => "blob:mock");
  const revokeUrl = vi.fn();
  // jsdom's URL lacks createObjectURL — assign rather than spy on a
  // nonexistent property.
  Object.assign(URL, {
    createObjectURL: createUrl,
    revokeObjectURL: revokeUrl,
  });
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  try {
    renderWithQueryClient();

    fireEvent.click(
      await screen.findByRole("button", { name: "Download CSV" }),
    );
    expect(createUrl).toHaveBeenCalledOnce();
    const csvBlob = createUrl.mock.calls[0][0] as Blob;
    expect(csvBlob.type).toBe("text/csv");
    expect(csvBlob.size).toBeGreaterThan(0);
    expect(clickSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
    const jsonBlob = createUrl.mock.calls[1][0] as Blob;
    expect(jsonBlob.type).toBe("application/json");
    expect(jsonBlob.size).toBeGreaterThan(0);
  } finally {
    clickSpy.mockRestore();
    // @ts-expect-error — removing the test stub
    delete URL.createObjectURL;
    // @ts-expect-error — removing the test stub
    delete URL.revokeObjectURL;
  }
});

test("export stays hidden until trials exist", async () => {
  renderWithQueryClient();
  await screen.findByText(/complete some levels/);
  expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
});
