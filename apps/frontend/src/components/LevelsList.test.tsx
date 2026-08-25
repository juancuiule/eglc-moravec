import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { RxDatabaseProvider } from "rxdb/plugins/react";
import { LevelsList } from "./LevelsList";
import { createAppDatabase, type AppDatabase } from "@/db/database";

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

let db: AppDatabase;

beforeEach(async () => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.mocked(Api.fetchLevelNumbers).mockResolvedValue([1, 2, 3]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db = await createAppDatabase(getRxStorageMemory(), `test-levelslist-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  // Explicit, not relying on hook-registration order across files: unmount
  // (which unsubscribes useLiveRxQuery's live subscription) must finish
  // before the collection closes, or that subscription throws trying to
  // react to a "collection closed" event on an already-unmounting query.
  cleanup();
  await db.close();
});

function renderWithProviders() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <RxDatabaseProvider database={db}>
      <QueryClientProvider client={client}>
        <LevelsList />
      </QueryClientProvider>
    </RxDatabaseProvider>,
  );
}

test("level 1 is unlocked and links to play; level 2 is locked, not a link", async () => {
  renderWithProviders();

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("shows an error message when the level catalog fails to load and there's no local copy", async () => {
  vi.mocked(Api.fetchLevelNumbers).mockRejectedValue(new Error("network down"));
  renderWithProviders();

  expect(await screen.findByText(/Couldn't load levels/)).toBeDefined();
});

test("falls back to the locally-replicated catalog, with a console warning, when the live fetch fails", async () => {
  await db.levels.bulkInsert([
    { levelNumber: "1", mix: { "1d+1d": 100 } },
    { levelNumber: "2", mix: { "1d+1d": 100 } },
  ]);
  vi.mocked(Api.fetchLevelNumbers).mockRejectedValue(new Error("network down"));

  renderWithProviders();

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Levels"));
  expect(screen.queryByText(/Couldn't load levels/)).toBeNull();
});
