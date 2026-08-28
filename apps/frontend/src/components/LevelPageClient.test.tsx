import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LevelPageClient } from "./LevelPageClient";

const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/storage/levelCache", () => ({
  fetchLevelWithFallback: vi.fn(),
}));

vi.mock("./LevelPlay", () => ({
  LevelPlay: ({ levelNumber }: { levelNumber: number }) => (
    <div>Playing level {levelNumber}</div>
  ),
}));

import { fetchLevelWithFallback } from "@/storage/levelCache";

beforeEach(() => {
  notFound.mockReset();
  vi.mocked(fetchLevelWithFallback).mockReset();
});

function renderWithQueryClient(levelNumber: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LevelPageClient levelNumber={levelNumber} />
    </QueryClientProvider>,
  );
}

test("renders LevelPlay once the mix resolves", async () => {
  vi.mocked(fetchLevelWithFallback).mockResolvedValue({ "1d+1d": 100 });

  renderWithQueryClient(3);

  expect(await screen.findByText("Playing level 3")).toBeDefined();
});

test("shows an error message with retry when the fetch fails and nothing is cached", async () => {
  vi.mocked(fetchLevelWithFallback).mockRejectedValue(new Error("network down"));

  renderWithQueryClient(3);

  expect(await screen.findByText(/Couldn't load this level/)).toBeDefined();

  vi.mocked(fetchLevelWithFallback).mockResolvedValue({ "1d+1d": 100 });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Playing level 3")).toBeDefined();
});

test("calls notFound() when the level genuinely doesn't exist", async () => {
  vi.mocked(fetchLevelWithFallback).mockResolvedValue(null);

  renderWithQueryClient(999);

  await waitFor(() => expect(notFound).toHaveBeenCalled());
});
