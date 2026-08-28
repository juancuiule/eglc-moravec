import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { store } from "./store";
import { storageStore } from "./storageStore";
import { StorageBoot } from "./StorageBoot";

beforeEach(() => {
  store.delTables();
  storageStore.setState({ ready: false });
});

describe("StorageBoot", () => {
  it("flips storageStore.ready to true once the IndexedDB persister has loaded", async () => {
    expect(storageStore.getState().ready).toBe(false);

    render(<StorageBoot />);

    await vi.waitFor(() => {
      expect(storageStore.getState().ready).toBe(true);
    });
  });

  it("makes previously-persisted data available on the store once ready", async () => {
    // Simulate a prior session's data already sitting in IndexedDB under
    // the same database name StorageBoot will use.
    const { createStore } = await import("tinybase");
    const { createIndexedDbPersister } = await import("tinybase/persisters/persister-indexed-db");
    const seedStore = createStore();
    seedStore.setRow("levelStats", "1", { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
    const seedPersister = createIndexedDbPersister(seedStore, "moravec-store");
    await seedPersister.save();
    seedPersister.destroy();

    render(<StorageBoot />);

    await vi.waitFor(() => {
      expect(storageStore.getState().ready).toBe(true);
    });
    expect(store.getRow("levelStats", "1")).toEqual({ stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
  });
});
