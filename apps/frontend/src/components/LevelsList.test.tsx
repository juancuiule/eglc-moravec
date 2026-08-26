import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LevelsList } from "./LevelsList";

vi.mock("@/api/Api", () => ({
  Api: { fetchLevelNumbers: vi.fn() },
}));

import { Api } from "@/api/Api";

// Minimal localStorage mock, matching the convention used elsewhere in this
// codebase — LevelsList reads level stats at mount time.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k in store) delete store[k];
  },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2, 3]);
});

function renderWithQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LevelsList />
    </QueryClientProvider>,
  );
}

test("level 1 is unlocked and links to play; level 2 is locked, not a link", async () => {
  renderWithQueryClient();

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("shows an error message when the level catalog fails to load", async () => {
  vi.mocked(Api.fetchLevelNumbers).mockRejectedValue(new Error("network down"));
  renderWithQueryClient();

  expect(await screen.findByText(/Couldn't load levels/)).toBeDefined();
});
