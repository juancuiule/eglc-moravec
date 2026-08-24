import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { useRxCollection } from "rxdb/plugins/react";
import { AppDatabaseProvider } from "./AppDatabaseProvider";

vi.mock("./database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./database")>();
  return { ...actual, getAppDatabase: vi.fn() };
});

vi.mock("../api/Api", () => ({
  Api: {
    fetchLevelNumbers: vi.fn().mockResolvedValue([]),
    fetchLevel: vi.fn(),
  },
}));

import { createAppDatabase, getAppDatabase, type AppDatabase } from "./database";

let db: AppDatabase;

beforeEach(async () => {
  db = await createAppDatabase(getRxStorageMemory(), `test-provider-${Math.random().toString(36).slice(2)}`);
  vi.mocked(getAppDatabase).mockResolvedValue(db);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await db.close();
});

function ChildUsingCollection() {
  const levels = useRxCollection("levels");
  return <div>{levels ? "collection-ready" : "collection-missing"}</div>;
}

test("renders nothing until the database resolves, then wraps children in the provider", async () => {
  render(
    <AppDatabaseProvider>
      <ChildUsingCollection />
    </AppDatabaseProvider>,
  );

  // Nothing under the provider is rendered yet — useRxCollection etc. would
  // throw if they ran before RxDatabaseProvider is actually in the tree.
  expect(screen.queryByText(/collection-/)).toBeNull();

  expect(await screen.findByText("collection-ready")).toBeDefined();
});

test("shows an error with a retry, instead of leaving the whole app blank forever, when the database fails to open", async () => {
  vi.mocked(getAppDatabase).mockRejectedValueOnce(new Error("IndexedDB blocked"));

  render(
    <AppDatabaseProvider>
      <ChildUsingCollection />
    </AppDatabaseProvider>,
  );

  expect(await screen.findByText(/Couldn't start the local database/)).toBeDefined();
  expect(screen.queryByText(/collection-/)).toBeNull();

  // getAppDatabase() already resolves on the next call (its own cache reset
  // on failure, tested separately) — retry should reach the same success
  // path as a normal first load.
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("collection-ready")).toBeDefined();
});
