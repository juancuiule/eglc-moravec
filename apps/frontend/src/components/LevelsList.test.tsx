import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LevelsList } from "./LevelsList";
import { authStore } from "@/auth/store";
import type { LevelStats } from "@/api/Api";

vi.mock("@/api/Api", () => ({
  Api: { fetchLevelNumbers: vi.fn(), fetchLevelStats: vi.fn() },
}));

import { Api } from "@/api/Api";

beforeEach(() => {
  vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2, 3]);
  vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  // Every real player has a session by the time this renders (see
  // AuthBoot) — LevelsList's stats fetch needs a token to run at all.
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
});

function renderWithQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LevelsList />
    </QueryClientProvider>,
  );
}

test("level 1 is unlocked and links to play; level 2 is locked (level 1 has no stars), not a link", async () => {
  renderWithQueryClient();

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("level 2 unlocks once level 1 has at least one star", async () => {
  const stats: Record<string, LevelStats> = {
    "1": { stars: 1, totalTime: 9000, completedAt: new Date().toISOString() },
  };
  vi.mocked(Api.fetchLevelStats).mockResolvedValue(stats);

  renderWithQueryClient();

  const level2 = await screen.findByRole("link", { name: /Level 2/ });
  expect(level2.getAttribute("href")).toBe("/level/2");
});

test("shows an error message when the level catalog fails to load", async () => {
  vi.mocked(Api.fetchLevelNumbers).mockRejectedValue(new Error("network down"));
  renderWithQueryClient();

  expect(await screen.findByText(/Couldn't load levels/)).toBeDefined();
});

test("'Try again' retries the failed fetch", async () => {
  vi.mocked(Api.fetchLevelNumbers).mockRejectedValue(new Error("network down"));
  renderWithQueryClient();
  await screen.findByText(/Couldn't load levels/);

  vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("link", { name: /Level 1/ })).toBeDefined();
  expect(screen.queryByText(/Couldn't load levels/)).toBeNull();
});
