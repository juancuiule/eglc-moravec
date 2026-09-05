import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsScreen } from "./StatsScreen";
import { authStore } from "@/auth/store";
import { IntlTestProvider } from "@/testUtils/renderWithIntl";
import type { EvaluatedTrialResult } from "engine";

vi.mock("@/api/Api", () => ({
  Api: { fetchTrials: vi.fn() },
}));

import { Api } from "@/api/Api";

beforeEach(() => {
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
  const trials: EvaluatedTrialResult[] = [
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
  const trials: EvaluatedTrialResult[] = [
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
  const trials: EvaluatedTrialResult[] = [
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

  vi.mocked(Api.fetchTrials).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText(/No data yet/)).toBeDefined();
});
